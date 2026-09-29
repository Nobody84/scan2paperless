# Copilot Instructions

## Project overview

This project is a small self-hosted web application for scanning documents and sending them to Paperless-ngx.

The application provides a simple workflow:

1. Configure scanservjs and Paperless-ngx.
2. Select scan options.
3. Start a scan.
4. Wait for the scan to complete.
5. Display the scanned document.
6. Enter or modify the document title/name.
7. Select the document date.
8. Select or create Paperless tags.
9. Upload the document to Paperless-ngx with the selected metadata.

The application is intended for use on a trusted local network but must still follow good security practices.

## Technology

Use:

* TypeScript
* React
* Vite
* Node.js for the server-side API
* A lightweight Node.js HTTP framework only when it provides clear value
* Modern ES modules
* Strict TypeScript

Do not introduce ASP.NET Core for this project.

The application is a full-stack TypeScript application:

```text
Browser
  |
  | HTTP/HTTPS
  v
Node.js application server
  |
  +---- scanservjs
  |
  +---- Paperless-ngx
```

The React application is the frontend.

The Node.js server is responsible for communication with scanservjs and Paperless-ngx and for keeping credentials out of browser code.

## Architecture

Keep frontend and backend concerns clearly separated.

Suggested structure:

```text
src/
  client/
    api/
    components/
    pages/
    hooks/
    models/
    state/
  server/
    api/
    services/
    clients/
    models/
    config/
  shared/
    models/
    types/
```

The exact structure may be adjusted if the chosen framework/build configuration requires it, but maintain a clear separation between:

* UI
* application logic
* external API clients
* configuration
* shared types

Do not put scanservjs or Paperless API calls directly into React components.

React components should call application services/API endpoints exposed by our own server.

## External services

The application communicates with two external systems.

### scanservjs

scanservjs is the scanner frontend and scanner API.

Official repository:

https://github.com/sbs20/scanservjs

scanservjs provides OpenAPI documentation at:

```text
/api-docs
```

Always inspect the current scanservjs OpenAPI specification before implementing or changing scanservjs integration.

Do not guess endpoint names, request formats, response formats, or option names.

The application must support configuring:

* URL
* credentials
* default device
* default source
* default resolution
* default mode
* default batch mode
* default output format

The scan UI must allow the user to select/change the available scan options.

Do not hard-code scanner-specific values.

Scanner capabilities can vary between devices. Where scanservjs exposes available options, use those values instead of assuming that every scanner supports the same values.

Relevant scanservjs concepts include:

* device
* source
* resolution
* mode
* batch
* format

scanservjs supports, among other features:

* Flatbed / ADF source selection
* configurable resolution
* PDF, TIFF, PNG, JPG and TXT output
* batch scanning
* scanner-specific capabilities

Do not duplicate scanservjs functionality unnecessarily. The application is an alternative simplified workflow UI on top of scanservjs.

### Paperless-ngx

The application communicates with Paperless-ngx through its REST API.

Before implementing Paperless integration, inspect the current Paperless API documentation.

Relevant API documentation:

https://docs.paperless-ngx.com/api/

The application must support configuring:

* URL
* credentials
* predefined tags

The application must be able to:

* retrieve available tags
* create a new tag
* upload a document
* set the document title
* set the document creation date
* assign multiple tags

Paperless API credentials must NEVER be sent to the browser.

The server must perform authenticated Paperless API requests.

Use the Paperless document upload endpoint where appropriate:

```text
POST /api/documents/post_document/
```

The upload should set the metadata during upload when supported by the Paperless API.

Do not upload the document first and then perform a second metadata update unless the API requires this.

## Security

Security is important even though this is primarily a self-hosted application.

Never:

* expose scanservjs passwords to the browser
* expose Paperless passwords or API tokens to the browser
* store external service credentials in localStorage
* put credentials into React source code
* put credentials into Vite `VITE_*` environment variables
* log credentials
* log authorization headers
* log uploaded document contents
* include credentials in URLs

Credentials belong exclusively on the server side.

Frontend configuration may contain public application configuration, but external-service secrets must remain server-side.

If authentication tokens are used, store them securely on the server.

Use HTTPS when the application is deployed over an untrusted network.

## Configuration

Provide a settings page with two sections.

### scanservjs settings

```text
URL
Credentials
Default device
Default source
Default resolution
Default mode
Default batch
Default format
```

### Paperless settings

```text
URL
Credentials
Predefined tags
```

Settings should be represented by typed configuration models.

Do not scatter configuration access throughout the application.

Create a central configuration service.

The server should validate configuration before attempting to use it.

The settings UI should provide a way to test the connection to:

* scanservjs
* Paperless-ngx

Connection errors should be presented in a useful human-readable form.

Do not expose raw credentials or authorization headers in error messages.

## Scan workflow

When the user enters the application, the main scan page should be shown.

The scan page should contain:

* device
* source
* resolution
* mode
* batch
* format
* Scan button

Default values come from the application settings.

Where possible, available values should come from scanservjs rather than being hard-coded.

### Starting a scan

When the user presses Scan:

1. Validate the selected scan options.
2. Send the scan request to the application server.
3. The server invokes scanservjs.
4. Track the scan until it completes.
5. Obtain the resulting scanned file.
6. Make the resulting file available to the frontend.
7. Display the scanned document.

The UI must clearly show:

* idle
* scanning
* scan completed
* scan failed

Do not block the UI unnecessarily while waiting for a scan.

Prevent accidental duplicate scan requests while a scan is already running.

## Scanned document

After a successful scan, display the scanned document.

For PDFs, provide an embedded PDF preview where supported.

For image formats, display an image preview.

The user must then be able to enter:

```text
Name / Title
Date
Tags
```

The date defaults to the current local date.

The user must be able to change the date before uploading.

Do not confuse:

* document creation date
* application upload date
* scan date

The value entered by the user is the Paperless document creation date.

## Paperless tags

Retrieve the available tags from Paperless-ngx.

The tag selector must support:

* searching/filtering tags
* selecting multiple tags
* creating a new tag
* recently used tags
* most frequently used tags
* tags configured as predefined settings

The UI should make these groups visually distinguishable:

```text
Recently used
Most used
Predefined
All tags
```

A tag can occur in more than one group.

Do not create duplicate tags.

When creating a tag:

1. Check whether the tag already exists.
2. If it exists, use the existing tag.
3. Otherwise create it through the Paperless API.
4. Add the newly created tag to the current document selection.

Do not implement tag creation only locally.

The Paperless server is the source of truth for Paperless tags.

## Tag usage statistics

Recently used and most-used tags are application-level convenience features.

Do not modify Paperless tag data to implement usage statistics.

Keep usage statistics separately in the application's own persistence mechanism.

The implementation should allow the persistence mechanism to be changed later.

Do not introduce a database merely for tag statistics unless it is actually required by the architecture.

If persistent statistics require storage, prefer a simple server-side storage mechanism appropriate for a small self-hosted application.

## Upload workflow

After the user has entered the metadata, provide an explicit:

```text
Upload to Paperless
```

button.

Before uploading:

* verify that a scanned file exists
* verify that the title is valid
* verify that the date is valid
* verify that all selected tags exist
* verify the Paperless connection

The server performs the actual Paperless upload.

The frontend must not directly upload to Paperless using stored credentials.

After successful upload:

* show a success message
* provide the Paperless document identifier when available
* optionally provide a link to the Paperless document when the Paperless API provides enough information
* clear the current scan state only after success

If upload fails, keep the scanned document and entered metadata so the user can retry.

Do not discard a scanned document because an upload failed.

## Error handling

Errors from external APIs must be translated into useful application errors.

Do not expose:

* passwords
* access tokens
* authorization headers
* internal filesystem paths
* internal stack traces

The UI should distinguish between:

* scan errors
* scanservjs connection errors
* Paperless connection errors
* Paperless authentication errors
* tag errors
* upload errors
* invalid user input

The server should log technical details needed for debugging, but must redact credentials and sensitive information.

## API clients

Create dedicated typed clients:

```text
ScanservClient
PaperlessClient
```

Do not make raw HTTP requests throughout the application.

The clients should encapsulate:

* authentication
* URL construction
* request handling
* response parsing
* error handling

Use typed request and response models.

Do not use `any` for external API responses.

If an API response is not completely understood, inspect its current API/OpenAPI documentation before implementing assumptions.

## TypeScript

Use strict TypeScript.

Prefer:

* interfaces/types for API contracts
* discriminated unions for state machines
* explicit return types for important service methods
* `unknown` instead of `any`
* async/await
* immutable state updates
* small focused functions

Avoid:

* `any`
* unnecessary type assertions
* global mutable state
* deeply nested components
* large components containing API/business logic

## React

Use functional React components.

Keep components focused.

Do not put external API communication directly inside presentational components.

Use hooks or application services for stateful behavior.

Avoid introducing a global state-management library unless the application actually requires one.

Start with React state and context where sufficient.

## UI

The UI should be optimized for a simple scanning workflow.

The primary page should make this workflow obvious:

```text
1. Select scan options
2. Scan
3. Review scanned document
4. Enter metadata
5. Select tags
6. Upload to Paperless
```

The application should work well on desktop and tablet-sized screens.

Prefer a clean, functional interface over unnecessary visual effects.

Use Material Design Icons / MDI when icons are needed.

Do not use Google Material Symbols when an MDI icon is appropriate.

## Accessibility

Use semantic HTML.

All form controls must have accessible labels.

Buttons must have meaningful accessible names.

Do not communicate important information using color alone.

Keyboard navigation should work throughout the application.

## API and state design

Represent the scan workflow explicitly.

For example:

```text
idle
starting
scanning
processing
completed
uploading
uploaded
error
```

Do not rely on loosely related boolean flags such as:

```text
isScanning
isLoading
hasScan
isUploading
hasError
```

when an explicit state model would be clearer.

Avoid race conditions between:

* starting a scan
* polling scan status
* downloading a scan
* changing metadata
* uploading to Paperless

## File handling

Scanned documents can be large.

Avoid converting entire documents to base64 unnecessarily.

Prefer streaming or binary HTTP responses where practical.

Do not permanently store scanned files unless required by the application.

Temporary scan files must be cleaned up after:

* successful upload
* explicit cancellation
* expiration/timeout
* unrecoverable failure

Do not delete a file before the upload has successfully completed.

## Persistence

Keep application settings server-side.

Do not store service credentials in browser localStorage.

For user convenience, recently-used and most-used tags may be persisted server-side.

Keep the persistence abstraction separate from the UI.

Do not introduce a large database or ORM without a concrete requirement.

## Configuration and environment

Separate application configuration from secrets.

Environment variables may be used for initial server configuration.

Never expose secret environment variables through the Vite frontend.

Use an `.env.example` file containing placeholders only.

Never commit:

```text
.env
```

or other files containing credentials.

## Testing

Write tests for important application behavior.

Prioritize:

* scan workflow state transitions
* scanservjs client
* Paperless client
* Paperless tag handling
* duplicate tag prevention
* upload metadata construction
* error handling
* configuration validation

External services should be mocked in unit tests.

Do not require a real scanner or real Paperless instance for normal unit tests.

Integration tests may use explicitly configured test instances.

## API documentation

When working with scanservjs:

1. Inspect the current scanservjs OpenAPI documentation.
2. Determine the actual endpoints and request/response structures.
3. Implement the typed client against those definitions.
4. Do not guess undocumented endpoints.

When working with Paperless:

1. Inspect the current Paperless API documentation.
2. Determine the actual endpoint and request format.
3. Implement the typed client.
4. Do not guess API fields.

External API behavior takes precedence over assumptions in this file.

## Copilot behavior

Before implementing a significant feature:

1. Inspect the existing project structure.
2. Reuse existing patterns.
3. Inspect the relevant external API documentation.
4. Identify affected files.
5. Explain the proposed approach briefly.
6. Then implement the change.

Do not introduce a new framework, library, database, architecture pattern, or state-management system simply because it is familiar.

Prefer the simplest implementation that satisfies the requirements.

Do not rewrite unrelated files.

Do not perform large refactors while implementing an unrelated feature.

Keep changes focused and reviewable.

## Dependency policy

Minimize dependencies.

Before adding a dependency:

1. Determine whether the functionality can reasonably be implemented with the existing stack.
2. Check whether an existing dependency already provides the functionality.
3. Prefer mature, well-maintained libraries.
4. Keep the dependency's purpose clear.

Do not add libraries merely for convenience.

## Documentation

Document important architectural decisions.

Keep the README up to date with:

* development setup
* configuration
* environment variables
* running the application
* building the application
* deployment
* scanservjs requirements
* Paperless requirements

Document assumptions about external API versions when they matter.

## Development workflow

The application must be runnable locally on Linux.

Development should support:

```text
npm install
npm run dev
npm run build
npm test
```

Use the project's actual package manager and scripts once established.

Do not assume npm if the project already uses another package manager.

## Deployment

The application is intended to be self-hosted.

Keep deployment simple.

A containerized deployment should be possible.

The application must not require direct access from the browser to scanservjs or Paperless-ngx.

The application server should be the integration point.

## Important principle

The application is a workflow layer between a scanner managed by scanservjs and Paperless-ngx.

Do not reimplement scanner functionality that scanservjs already provides.

Do not reimplement document management functionality that Paperless-ngx already provides.

Use their APIs and keep this application focused on:

```text
Scan → Review → Metadata → Tags → Paperless
```
