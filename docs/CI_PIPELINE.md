# CI Pipeline

This repository is validated as a monorepo with separate checks for:

- `src/frontend`: Next.js
- `src/backend`: NestJS
- `src/analytics`: Python analytics service
- `src/mobile`: React Native and Expo, once that app is added

## Branch Flow

Recommended branch usage:

- `main`: production-ready code
- `develop`: integration branch for completed work
- `feature/*`: feature branches used by developers
- `release/*`: release preparation branches

Open pull requests into `develop` for feature work, then promote tested changes from `develop` into `main`.

## Required GitHub Secrets

Add this repository secret before enabling the Sonar scan:

- `SONAR_TOKEN`: token generated from SonarQube or SonarCloud

## Validation Jobs

The workflow in `.github/workflows/ci.yml` runs:

- repository structure validation
- frontend and backend dependency install, formatting check, typecheck, and build
- analytics dependency install, Ruff linting, Ruff formatting check, and pytest when tests exist
- mobile validation only when `src/mobile/package.json` exists
- Sonar scan when `SONAR_TOKEN` is configured

## Sonar Setup

The root `sonar-project.properties` file defines the project key, source paths, exclusions, and future coverage report paths.

For SonarCloud, create a project using:

- Organization: your SonarCloud organization
- Project key: `caisteven17-code_PAULUS`

For a self-hosted SonarQube server, add `SONAR_HOST_URL` as a repository secret and pass it to the scan action if your server is not using the default SonarCloud endpoint.
