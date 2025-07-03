# Research Optimizer

Research Optimizer provides tools to query, transform, and analyze biomedical and regulatory information. Supporting the Clinical & Translational Research Informatics Branch (CTRIB) mission, we streamline workflows and make insights accessible for clinical, research, and regulatory work.

## Getting Started
1. Clone repository: `git clone https://github.com/CBIIT/nci-webtools-ctri-arti`
2. Open repo folder: `cd nci-webtools-ctri-arti`
3. Create `server/.env` file from `server/.env.example`: `cp server/.env.example server/.env`
4. Configure `server/.env` with AWS credentials and Parameter Store values
5. Start server+postgres services: `docker compose up --build`
6. (Optional) Use `w` to enable Watch mode and rebuild on changes
7. Go to https://localhost to use application (ignore invalid cert authority errors when using self-signed certs)
8. To reset your local database (eg: for schema errors), delete the `postgres` folder