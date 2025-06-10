import { createSignal, createResource, Show } from "solid-js";
import html from "solid-js/html";
import { useParams } from "@solidjs/router";

function UserUsage() {
  const params = useParams();
  const userId = params.id;
  
  // Set up date range with default values
  const [dateRange, setDateRange] = createSignal({
    startDate: getDefaultStartDate(),
    endDate: formatDate(new Date())
  });
  
  // Create resource for fetching usage data
  const [usageData, { refetch }] = createResource(
    () => {
      const { startDate, endDate } = dateRange();
      return fetch(`/api/admin/users/${userId}/usage?startDate=${startDate}&endDate=${endDate}`)
        .then(res => res.json());
    }
  );
  
  // Get default start date (30 days ago)
  function getDefaultStartDate() {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return formatDate(date);
  }
  
  // Format date as YYYY-MM-DD
  function formatDate(date) {
    return date.toISOString().split('T')[0];
  }
  
  // Format currency
  function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 4,
      maximumFractionDigits: 4
    }).format(value);
  }
  
  // Format numbers with commas
  function formatNumber(value) {
    return new Intl.NumberFormat('en-US').format(value);
  }
  
  // Handle date range change
  function handleDateRangeChange(field, value) {
    setDateRange(prev => ({ ...prev, [field]: value }));
  }
  
  // Apply date filter
  function applyDateFilter(e) {
    e.preventDefault();
    refetch();
  }
  
  return html`
    <div class="container py-4">
      <div class="d-flex justify-content-between align-items-center mb-4">
        <h1 class="font-title text-gradient fw-bold my-3">Usage Statistics</h1>
        <div class="d-flex gap-2">
          <a 
            href="/_/usage"
            class="btn btn-outline-primary btn-sm text-decoration-none">
            Back to Usage Dashboard
          </a>
        </div>
      </div>
      
      <!-- User Info Card -->
      <div class="card shadow-sm mb-4">
        <div class="card-body">
          <div class="row">
            <div class="col-md-6">
              <h5>${() => usageData()?.user ? `${usageData().user.firstName || ''} ${usageData().user.lastName || ''}` : ''}</h5>
              <p class="text-muted mb-0">${() => usageData()?.user?.email || 'No email'}</p>
            </div>
            <div class="col-md-6 text-md-end">
              <div class="mb-1">
                <span class="fw-bold">Limit:</span> 
                <span>${() => formatCurrency(usageData()?.user?.limit || 0)}</span>
              </div>
              <div>
                <span class="fw-bold">Remaining:</span> 
                <span>${() => formatCurrency(usageData()?.user?.remaining || 0)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Date Range Filter -->
      <div class="card shadow-sm mb-4">
        <div class="card-body">
          <h5 class="card-title">Filter</h5>
          <form onSubmit=${applyDateFilter} class="row g-3 align-items-end">
            <div class="col-md-5">
              <label for="startDate" class="form-label">Start Date</label>
              <input 
                type="date" 
                id="startDate" 
                class="form-control" 
                value=${() => dateRange().startDate} 
                max=${() => dateRange().endDate}
                onInput=${e => handleDateRangeChange('startDate', e.target.value)} />
            </div>
            <div class="col-md-5">
              <label for="endDate" class="form-label">End Date</label>
              <input 
                type="date" 
                id="endDate" 
                class="form-control" 
                value=${() => dateRange().endDate}
                min=${() => dateRange().startDate}
                max=${formatDate(new Date())}
                onInput=${e => handleDateRangeChange('endDate', e.target.value)} />
            </div>
            <div class="col-md-2">
              <button type="submit" class="btn btn-primary w-100">Apply</button>
            </div>
          </form>
        </div>
      </div>
      
      <!-- Error Alert -->
      <${Show} when=${() => usageData.error}>
        <div class="alert alert-danger" role="alert">
          ${() => usageData.error || "An error occurred while fetching usage data"}
        </div>
      <//>
      
      <!-- Loading State -->
      <${Show} when=${() => usageData.loading}>
        <div class="d-flex justify-content-center my-5">
          <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
          </div>
        </div>
      <//>
      
      <!-- Usage Summary -->
      <${Show} when=${() => !usageData.loading && usageData()?.summary}>
        <div class="row mb-4">
          <!-- Summary Card -->
          <div class="col-md-12">
            <div class="card shadow-sm h-100">
              <div class="card-header bg-light">
                <h5 class="card-title mb-0">Usage Summary</h5>
              </div>
              <div class="card-body">
                <div class="row">
                  <div class="col-md-3 mb-3">
                    <div class="card h-100">
                      <div class="card-body text-center">
                        <h6 class="text-muted">Total Requests</h6>
                        <h3>${() => formatNumber(usageData().summary.totalRequests)}</h3>
                      </div>
                    </div>
                  </div>
                  <div class="col-md-3 mb-3">
                    <div class="card h-100">
                      <div class="card-body text-center">
                        <h6 class="text-muted">Input Tokens</h6>
                        <h3>${() => formatNumber(usageData().summary.totalInputTokens)}</h3>
                      </div>
                    </div>
                  </div>
                  <div class="col-md-3 mb-3">
                    <div class="card h-100">
                      <div class="card-body text-center">
                        <h6 class="text-muted">Output Tokens</h6>
                        <h3>${() => formatNumber(usageData().summary.totalOutputTokens)}</h3>
                      </div>
                    </div>
                  </div>
                  <div class="col-md-3 mb-3">
                    <div class="card h-100">
                      <div class="card-body text-center">
                        <h6 class="text-muted">Total Cost</h6>
                        <h3>${() => formatCurrency(usageData().summary.totalCost)}</h3>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
          
        <div class="row mb-4">
          <!-- Model Breakdown -->
          <div class="col-md-6 mb-3">
            <div class="card shadow-sm h-100">
              <div class="card-header bg-light">
                <h5 class="card-title mb-0">Usage by Model</h5>
              </div>
              <div class="card-body">
                <table class="table table-sm">
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th class="text-end">Requests</th>
                      <th class="text-end">Tokens</th>
                      <th class="text-end">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${() => Object.entries(usageData().usageByModel || {}).map(([modelName, stats]) => html`
                      <tr>
                        <td>${modelName}</td>
                        <td class="text-end">${formatNumber(stats.count)}</td>
                        <td class="text-end">${formatNumber(stats.inputTokens + stats.outputTokens)}</td>
                        <td class="text-end">${formatCurrency(stats.cost)}</td>
                      </tr>
                    `)}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          
          <!-- Daily Usage -->
          <div class="col-md-6 mb-3">
            <div class="card shadow-sm h-100">
              <div class="card-header bg-light">
                <h5 class="card-title mb-0">Daily Usage</h5>
              </div>
              <div class="card-body">
                ${() => usageData().dailyUsage && usageData().dailyUsage.length > 0 ? html`
                  <table class="table table-sm">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th class="text-end">Requests</th>
                        <th class="text-end">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${() => usageData().dailyUsage.map(day => html`
                        <tr>
                          <td>${day.date}</td>
                          <td class="text-end">${formatNumber(day.count)}</td>
                          <td class="text-end">${formatCurrency(day.cost)}</td>
                        </tr>
                      `)}
                    </tbody>
                  </table>
                ` : html`
                  <p class="text-muted text-center my-4">No daily usage data available</p>
                `}
              </div>
            </div>
          </div>
        </div>
        
        <!-- Recent Requests -->
        <div class="card shadow-sm mb-4">
          <div class="card-header bg-light">
            <h5 class="card-title mb-0">Recent Requests</h5>
          </div>
          <div class="card-body">
            ${() => usageData().rawData && usageData().rawData.length > 0 ? html`
              <div class="table-responsive">
                <table class="table table-sm table-hover">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Model</th>
                      <th class="text-end">Input Tokens</th>
                      <th class="text-end">Output Tokens</th>
                      <th class="text-end">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${() => usageData().rawData.slice(0, 20).map(entry => html`
                      <tr>
                        <td>${new Date(entry.createdAt).toLocaleString()}</td>
                        <td>${entry.Model?.label || 'Unknown'}</td>
                        <td class="text-end">${formatNumber(entry.inputTokens || 0)}</td>
                        <td class="text-end">${formatNumber(entry.outputTokens || 0)}</td>
                        <td class="text-end">${formatCurrency(entry.cost || 0)}</td>
                      </tr>
                    `)}
                  </tbody>
                </table>
              </div>
            ` : html`
              <p class="text-muted text-center my-4">No recent requests found</p>
            `}
          </div>
        </div>
      <//>
      
      <!-- No Data Message -->
      <${Show} when=${() => !usageData.loading && !usageData()?.summary}>
        <div class="alert alert-info">
          No usage data found for this user in the selected date range.
        </div>
      <//>
    </div>
  `;
}

export default UserUsage;