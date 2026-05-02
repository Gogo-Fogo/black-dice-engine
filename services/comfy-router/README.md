# Comfy Router

Local media routing scaffold for ComfyUI.

Current responsibilities:

- Expose a health endpoint.
- Publish a small placeholder workflow registry.
- Accept media-job preparation requests.
- Return prepared job contracts without pretending ComfyUI execution already exists.
- Keep output destinations outside this repository through environment configuration.

Current endpoints:

- `GET /health`
- `GET /api/workflows`
- `GET /api/prompt-templates`
- `GET /api/jobs`
- `POST /api/jobs/prepare`

Registry format:

- Workflows now live in `G:\Workspace\MyTools\Black Dice Engine\comfy-workflows\registry.json`
- Prompt templates now live in `G:\Workspace\MyTools\Black Dice Engine\prompts\image-prompt-templates.json`
- Each entry should define:
  - `id`
  - `type`
  - `label`
  - `description`
  - `runWhen`
  - `visibility`
  - `promptTemplateId`
  - `workflowPath`
  - `outputCategory`
  - `tags`
- Each prepared image job should resolve through both:
  - a workflow entry
  - a prompt-template entry

Important notes:

- This service is still a scaffold, not a full ComfyUI executor.
- Real submission should wait until workflow registry format and output-path policy are finalized.
- Use `BDE_COMFY_API_BASE` and `BDE_COMFY_OUTPUT_ROOT` later to move from placeholder mode to configured mode.
