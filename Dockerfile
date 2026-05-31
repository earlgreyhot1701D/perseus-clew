# Perseus Clew scan engine
# Multi-stage: Lambda deployment + local dev via docker compose

# Stage 1: Install dependencies
FROM public.ecr.aws/lambda/nodejs:20 AS deps
WORKDIR /var/task
COPY backend/package.json ./
COPY backend/package-lock.json ./
RUN npm ci --omit=dev

# Stage 2: Build source
FROM deps AS build
COPY backend/src ./src
RUN cp -r src dist

# Stage 3: Lambda runtime
FROM public.ecr.aws/lambda/nodejs:20
WORKDIR /var/task
COPY --from=deps /var/task/node_modules ./node_modules
COPY --from=build /var/task/dist ./dist
CMD ["dist/handlers/index.handler"]
