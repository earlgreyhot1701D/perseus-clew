# Perseus Clew scan engine
# Multi-stage: Lambda deployment + local dev via docker compose

# Stage 1: Install dependencies
FROM public.ecr.aws/lambda/nodejs:20 AS deps
WORKDIR /var/task
COPY package.json ./package.json
COPY package-lock.json ./package-lock.json
COPY backend/package.json ./backend/package.json
RUN npm ci -w backend --omit=dev

# Stage 2: Build source
FROM deps AS build
COPY backend/src ./src
RUN cp -r src dist

# Stage 3: Lambda runtime
FROM public.ecr.aws/lambda/nodejs:20
WORKDIR /var/task
COPY --from=deps /var/task/package.json ./package.json
COPY --from=deps /var/task/node_modules ./node_modules
COPY --from=build /var/task/dist ./dist
CMD ["dist/handlers/index.handler"]
