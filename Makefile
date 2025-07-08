.PHONY: help install dev test build deploy clean

# Default target
help:
	@echo "WordPress Visual Diff Checker - Available commands:"
	@echo "  install  - Install all dependencies"
	@echo "  dev      - Start development servers"
	@echo "  test     - Run all tests"
	@echo "  build    - Build all components"
	@echo "  deploy   - Deploy to production"
	@echo "  clean    - Clean temporary files"

# Install dependencies
install:
	@echo "Installing root dependencies..."
	npm install
	@echo "Installing Cloud Run dependencies..."
	cd cloud-run && npm install
	@echo "Installing Cloud Functions dependencies..."
	cd cloud-functions/sheets-sync && npm install
	cd cloud-functions/cleanup && npm install
	@echo "Installing GAS dependencies..."
	cd gas && npm install
	@echo "Installing E2E test dependencies..."
	cd tests/e2e && npm install

# Development
dev:
	@echo "Starting development environment..."
	cd cloud-run && npm run dev

# Testing
test:
	@echo "Running unit tests..."
	cd cloud-run && npm test
	@echo "Running E2E tests..."
	cd tests/e2e && npm test

# Build
build:
	@echo "Building Cloud Run container..."
	cd cloud-run && docker build -t vrt-runner .
	@echo "Preparing GAS files..."
	cd gas && npm run push --dry-run

# Deploy (requires authentication)
deploy:
	@echo "Deploying to production..."
	@echo "Note: This requires proper GCP authentication"
	git push origin main

# Clean
clean:
	@echo "Cleaning temporary files..."
	find . -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true
	find . -name "*.log" -delete
	docker system prune -f