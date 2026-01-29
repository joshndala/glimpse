# Build stage
FROM golang:1.23-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache git

# Copy go mod files
COPY backend/go.mod backend/go.sum ./
RUN go mod download

# Copy source code
COPY backend/*.go ./

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -o glimpse-backend .

# Runtime stage
FROM alpine:latest

# Install ffmpeg and ffprobe
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/glimpse-backend .

# Expose port
EXPOSE 8080

# Run the application
CMD ["./glimpse-backend"]
