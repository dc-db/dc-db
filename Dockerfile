# dc-db image: React frontend + Go backend in one binary.

# ---- frontend ----
FROM node:22-alpine AS web
ARG NPM_REGISTRY=https://registry.npmjs.org
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm config set registry "$NPM_REGISTRY" \
    && npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---- backend ----
FROM golang:1.26-alpine AS build
ARG GOPROXY=https://proxy.golang.org,direct
ENV GOPROXY=${GOPROXY}
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd ./cmd
COPY internal ./internal
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/dc-db ./cmd/dc-db

# ---- runtime ----
FROM alpine:3.22
RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -g 10001 -S dc-db \
    && adduser -u 10001 -S -G dc-db -H dc-db
WORKDIR /app
COPY --from=build /out/dc-db /app/dc-db
COPY --from=web /src/web/dist /app/web/dist
USER dc-db
EXPOSE 8080
ENTRYPOINT ["/app/dc-db"]
CMD ["serve"]
