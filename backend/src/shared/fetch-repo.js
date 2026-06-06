/**
 * Perseus Clew: GitHub repository fetcher.
 *
 * Fetches scannable files from a public GitHub repository using the
 * GitHub REST API. Returns file contents filtered to .html/.jsx/.tsx,
 * prioritized by directory, capped at 20 files.
 *
 * See BACKEND-SHARED.md section 4.
 */

import { AppError } from './errors.js';
import { logger } from './logger.js';

const MAX_NAME_LENGTH = 100;
const MAX_FILES = 20;
const MAX_FILE_SIZE = 500 * 1024; // 500KB
const NAME_PATTERN = /^[a-zA-Z0-9._\-]+$/;

const SCANNABLE_EXTENSIONS = ['.html', '.jsx', '.tsx'];
const EXCLUDED_DIRS = ['node_modules/', 'dist/', 'build/', '.next/', 'coverage/', '.git/'];
const PRIORITY_DIRS = ['src/', 'app/', 'pages/', 'components/'];
const SPEC_FILES = ['openapi.json', 'openapi.yaml', 'swagger.json', 'swagger.yaml'];
const SPEC_DIRS = ['', 'docs/', 'api/', 'spec/'];

const GITHUB_API = 'https://api.github.com';

/**
 * Get authorization headers if GITHUB_TOKEN is set.
 */
function getHeaders() {
  const headers = {
    'Accept': 'application/vnd.github.v3+json',
    'User-Agent': 'Perseus-Clew/0.1'
  };
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

/**
 * Validate owner and repo name format.
 */
function validateInput(owner, repo) {
  if (!owner || typeof owner !== 'string') {
    throw new AppError('VALIDATION_INVALID_REPO', 'Repository owner is required.');
  }
  if (!repo || typeof repo !== 'string') {
    throw new AppError('VALIDATION_INVALID_REPO', 'Repository name is required.');
  }
  if (owner.length > MAX_NAME_LENGTH || repo.length > MAX_NAME_LENGTH) {
    throw new AppError('VALIDATION_INVALID_REPO', 'Repository owner or name exceeds 100 characters.');
  }
  if (!NAME_PATTERN.test(owner) || !NAME_PATTERN.test(repo)) {
    throw new AppError('VALIDATION_INVALID_REPO', 'Repository owner or name contains characters that are not valid.');
  }
}

/**
 * Check if a file path is in an excluded directory.
 */
function isExcluded(path) {
  return EXCLUDED_DIRS.some(dir => path.startsWith(dir) || path.includes('/' + dir));
}

/**
 * Check if a file has a scannable extension.
 */
function isScannable(path) {
  return SCANNABLE_EXTENSIONS.some(ext => path.endsWith(ext));
}

/**
 * Check if a file is in a priority directory.
 */
function isPriority(path) {
  return PRIORITY_DIRS.some(dir => path.startsWith(dir) || path.includes('/' + dir));
}

/**
 * Handle GitHub API error responses.
 */
function handleApiError(response, owner, repo) {
  if (response.status === 404) {
    throw new AppError(
      'FETCH_NOT_FOUND',
      'This repo is private or does not exist. Perseus can only scan public repositories.',
      { owner, repo }
    );
  }

  if (response.status === 403) {
    const resetHeader = response.headers.get('x-ratelimit-reset');
    let retryMinutes = 60;
    if (resetHeader) {
      const resetTime = parseInt(resetHeader, 10) * 1000;
      retryMinutes = Math.max(1, Math.ceil((resetTime - Date.now()) / 60000));
    }
    throw new AppError(
      'FETCH_FORBIDDEN',
      `GitHub API rate limit reached. Try again in ${retryMinutes} minutes.`,
      { owner, repo, retryMinutes }
    );
  }

  throw new AppError(
    'FETCH_FORBIDDEN',
    `GitHub API returned status ${response.status} for this repository.`,
    { owner, repo, statusCode: response.status }
  );
}

/**
 * Fetch the repository tree (all file paths in one call).
 */
async function fetchTree(owner, repo, headers) {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`;
  const response = await fetch(url, { headers });

  if (!response.ok) {
    handleApiError(response, owner, repo);
  }

  const data = await response.json();
  return data.tree || [];
}

/**
 * Fetch a single file's content from GitHub.
 */
async function fetchFileContent(owner, repo, path, headers) {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const response = await fetch(url, { headers });

  if (!response.ok) return null;

  const data = await response.json();
  if (data.encoding === 'base64' && data.content) {
    return {
      content: Buffer.from(data.content, 'base64').toString('utf-8'),
      sizeBytes: data.size || 0
    };
  }
  return null;
}

/**
 * Fetch files from a public GitHub repository.
 *
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Promise<{files: Array, apiSpec: object|null, metadata: object}>}
 */
export async function fetchRepo(owner, repo) {
  validateInput(owner, repo);

  const headers = getHeaders();
  const tree = await fetchTree(owner, repo, headers);

  // Filter to scannable files, excluding banned directories
  const candidates = tree
    .filter(entry => entry.type === 'blob' && isScannable(entry.path) && !isExcluded(entry.path));

  // Sort: priority directories first, then alphabetical
  candidates.sort((a, b) => {
    const aPriority = isPriority(a.path) ? 0 : 1;
    const bPriority = isPriority(b.path) ? 0 : 1;
    if (aPriority !== bPriority) return aPriority - bPriority;
    return a.path.localeCompare(b.path);
  });

  const totalFilesConsidered = candidates.length;

  if (totalFilesConsidered === 0) {
    throw new AppError(
      'VALIDATION_EMPTY_REPO',
      'No HTML, JSX, or TSX files found in this repo.',
      { owner, repo }
    );
  }

  // Cap at MAX_FILES
  const toFetch = candidates.slice(0, MAX_FILES);
  const files = [];
  const skippedReasons = [];

  for (const entry of toFetch) {
    if (entry.size && entry.size > MAX_FILE_SIZE) {
      skippedReasons.push({ path: entry.path, reason: 'exceeds_size_limit' });
      continue;
    }

    const fileData = await fetchFileContent(owner, repo, entry.path, headers);
    if (!fileData) continue;

    if (fileData.sizeBytes > MAX_FILE_SIZE) {
      skippedReasons.push({ path: entry.path, reason: 'exceeds_size_limit' });
      continue;
    }

    files.push({
      path: entry.path,
      content: fileData.content,
      sizeBytes: fileData.sizeBytes
    });
  }

  // Search for API spec files
  let apiSpec = null;
  for (const dir of SPEC_DIRS) {
    for (const specFile of SPEC_FILES) {
      const specPath = dir ? `${dir}${specFile}` : specFile;
      const found = tree.find(entry => entry.path === specPath && entry.type === 'blob');
      if (found) {
        const specData = await fetchFileContent(owner, repo, specPath, headers);
        if (specData) {
          apiSpec = {
            path: specPath,
            content: specData.content,
            sizeBytes: specData.sizeBytes
          };
        }
        break;
      }
    }
    if (apiSpec) break;
  }

  logger.info('Repo fetched', {
    owner,
    repo,
    totalFilesConsidered,
    totalFilesReturned: files.length,
    apiSpecFound: !!apiSpec
  });

  return {
    files,
    apiSpec,
    metadata: {
      totalFilesConsidered,
      totalFilesReturned: files.length,
      skippedReasons
    }
  };
}
