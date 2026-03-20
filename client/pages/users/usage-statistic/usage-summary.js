import html from "solid-js/html";

export function UsageSummary(props) {
  return html`
    <div class="card usage-section-card">
      <div class="card-header">
        <h5 class="card-title">Usage Summary</h5>
      </div>
      <div class="card-body p-2">
        <div class="row g-2">
          <div class="col-md-3">
            <div class="card h-100">
              <div class="card-body text-center py-2">
                <h6 class="text-muted mb-1">Total Requests</h6>
                <h3 class="mb-0" style="color: #1075FD">${() => props.formatNumber(props.userStats.totalRequests)}</h3>
              </div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card h-100">
              <div class="card-body text-center py-2">
                <h6 class="text-muted mb-1">User Cost ($)</h6>
                <h3 class="mb-0" style="color: #9534E5">${() => props.formatCurrency(props.userStats.usageCost)}</h3>
              </div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card h-100">
              <div class="card-body text-center py-2">
                <h6 class="text-muted mb-1">Guardrail Cost ($)</h6>
                <h3 class="mb-0" style="color: #A438BF">${() => props.formatCurrency(props.userStats.guardrailCost)}</h3>
              </div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="card h-100">
              <div class="card-body text-center py-2">
                <h6 class="text-muted mb-1">Total Cost</h6>
                <h3 class="mb-0" style="color: #3848BF">${() => props.formatCurrency(props.userStats.totalCost)}</h3>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
