# Research Optimizer

Research Optimizer provides tools to query, transform, and analyze biomedical and regulatory information. Supporting the Clinical & Translational Research Informatics Branch (CTRIB) mission, we streamline workflows and make insights accessible for clinical, research, and regulatory work.

## Getting Started
1. Clone repository: `git clone https://github.com/CBIIT/nci-webtools-ctri-research-optimizer`
2. Open repo folder: `cd nci-webtools-ctri-research-optimizer`
3. Navigate to server folder: `cd server`
4. Create `.env` file from .env.example: `cp .env.example .env`
5. Create `key.pem` certificate: `npm run cert`
6. Configure `server/.env` to use ssl. Set PORT=443 and HTTPS_PEM=key.pem
7. (Optional) Configure `server/.env` with values from AWS Parameter Store (research-optimizer OAUTH and API_KEY parameters)
8. Start server+database: `docker compose up --build`
9. Go to https://localhost
10. (Optional) Use `w` to enable Watch mode and rebuild on changes
