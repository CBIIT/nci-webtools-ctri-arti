import html from "solid-js/html";

export function UsageSummary(props) {
  return html`
    <div class="card usage-section-card">
      <div class="card-header">
        <h5 class="card-title">Usage Summary</h5>
      </div>
      <div class="card-body">
        <div class="row">
          <div class="col-md-3 mb-3">
            <div class="card h-100">
              <div class="card-body text-center">
                <h6 class="text-muted">Total Requests</h6>
                <h3>${() => props.formatNumber(props.userStats.totalRequests)}</h3>
              </div>
            </div>
          </div>
          <div class="col-md-3 mb-3">
            <div class="card h-100">
              <div class="card-body text-center">
                <h6 class="text-muted">Input Tokens</h6>
                <h3>${() => props.formatNumber(props.userStats.totalInputTokens)}</h3>
              </div>
            </div>
          </div>
          <div class="col-md-3 mb-3">
            <div class="card h-100">
              <div class="card-body text-center">
                <h6 class="text-muted">Output Tokens</h6>
                <h3>${() => props.formatNumber(props.userStats.totalOutputTokens)}</h3>
              </div>
            </div>
          </div>
          <div class="col-md-3 mb-3">
            <div class="card h-100">
              <div class="card-body text-center">
                <h6 class="text-muted">Total Cost</h6>
                <h3>${() => props.formatCurrency(props.userStats.totalCost)}</h3>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
