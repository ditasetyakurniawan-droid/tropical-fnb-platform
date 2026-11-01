# syntax=docker/dockerfile:1.7

# ---- build ---------------------------------------------------------------
FROM golang:1.27-alpine AS build
WORKDIR /src

# Dependency layer is cached until go.mod/go.sum change.
COPY go.mod go.sum ./
RUN go mod download

COPY . .
ARG VERSION=dev
ARG COMMIT=none
ENV CGO_ENABLED=0 GOOS=linux
RUN go build -trimpath -ldflags "-s -w -X main.version=${VERSION} -X main.commit=${COMMIT}" -o /out/api ./cmd/api && \
    go build -trimpath -ldflags "-s -w" -o /out/migrate ./cmd/migrate

# ---- runtime -------------------------------------------------------------
# distroless/static: no shell, no package manager, runs as non-root.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/api /out/migrate /app/
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/app/api"]
