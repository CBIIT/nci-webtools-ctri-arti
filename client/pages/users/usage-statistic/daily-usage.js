import html from "solid-js/html";

export function DailyUsage(props) {
  return html`
    <div class="card usage-section-card h-100">
        <div class="card-header">
            <h5 class="card-title">Daily Usage</h5>
        </div>
        <div class="card-body">
            ${() =>
            props.dailyAnalytics?.data && props.dailyAnalytics.data.length > 0
                ? html`
                    <table class="table table-sm">
                    <thead>
                        <tr>
                        <th>Date</th>
                        <th>Total Requests</th>
                        <th class="text-end">Usage Cost</th>
                        <th class="text-end">Guardrail Cost</th>
                        <th class="text-end">Total Cost</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${() =>
                        props.dailyAnalytics.data.map(
                            (day) => html`
                            <tr>
                                <td>${props.formatUtcTimestampToLocal(day.period)}</td>
                                <td class="text-end">${props.formatNumber(day.totalRequests)}</td>
                                <td class="text-end">${day.usageCost != null ? props.formatCurrency(day.usageCost) : "Unavailable"}</td>
                                <td class="text-end">${day.guardrailCost != null ? props.formatCurrency(day.guardrailCost) : "Unavailable"}</td>
                                <td class="text-end">${day.totalCost != null ? props.formatCurrency(day.totalCost) : "Unavailable"}</td>
                            </tr>
                            `
                        )}
                    </tbody>
                    </table>
                `
                : html`
                    <p class="text-muted text-center my-4">No daily usage data available</p>
                `}
        </div>
    </div>
  `;
}
