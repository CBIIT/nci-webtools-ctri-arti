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
                        <th class="text-start">Total Requests</th>
                        <th class="text-start">Usage Cost</th>
                        <th class="text-start">Guardrail Cost</th>
                        <th class="text-start">Total Cost</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${() =>
                        props.dailyAnalytics.data.map(
                            (day) => {
                            console.log("day.period", day.period);
                            return html`
                            <tr>
                                <td class="text-start" style="color: #1075FD">${props.formatUTCTimestampToLocalDate(day.period)}</td>
                                <td class="text-start" >${props.formatNumber(day.totalRequests)}</td>
                                <td class="text-start">${day.usageCost != null ? props.formatCurrency(day.usageCost) : "Unavailable"}</td>
                                <td class="text-start">${day.guardrailCost != null ? props.formatCurrency(day.guardrailCost) : "Unavailable"}</td>
                                <td class="text-start">${day.totalCost != null ? props.formatCurrency(day.totalCost) : "Unavailable"}</td>
                            </tr>
                            `}
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
