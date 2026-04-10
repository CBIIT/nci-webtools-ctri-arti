export const USAGE_RESET_SCHEDULE = process.env.USAGE_RESET_SCHEDULE || "0 0 * * *";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function describeCron(cronExpr) {
  const parts = cronExpr.trim().split(/\s+/);
  if (parts.length !== 5)
    return { label: "Periodic", resetDescription: "the next scheduled reset" };

  const [min, hour, dom, month, dow] = parts;

  // Yearly: specific month and day-of-month
  if (month !== "*" && dom !== "*") {
    const monthIdx = parseInt(month, 10) - 1;
    const monthName = MONTH_NAMES[monthIdx] || month;
    return { label: "Yearly", resetDescription: `${monthName} ${ordinal(parseInt(dom, 10))}` };
  }

  // Monthly: specific day-of-month
  if (dom !== "*" && dow === "*" && month === "*" && !dom.includes("/")) {
    return {
      label: "Monthly",
      resetDescription: `the ${ordinal(parseInt(dom, 10))} of next month`,
    };
  }

  // Weekly: specific day-of-week
  if (dow !== "*" && dom === "*") {
    const dayIdx = parseInt(dow, 10);
    const dayName = DAY_NAMES[dayIdx] || dow;
    const timeHour = parseInt(hour, 10) || 0;
    const timeMin = parseInt(min, 10) || 0;
    const ampm = timeHour >= 12 ? "PM" : "AM";
    const displayHour = timeHour % 12 || 12;
    const displayMin = String(timeMin).padStart(2, "0");
    return {
      label: "Weekly",
      resetDescription: `${dayName} at ${displayHour}:${displayMin} ${ampm}`,
    };
  }

  // Every N hours
  if (hour.includes("/")) {
    const step = parseInt(hour.split("/")[1], 10);
    return {
      label: step === 1 ? "Hourly" : `Every ${step} Hours`,
      resetDescription: step === 1 ? "within 1 hour" : `within ${step} hours`,
    };
  }

  // Every N days
  if (dom.includes("/")) {
    const step = parseInt(dom.split("/")[1], 10);
    return {
      label: step === 1 ? "Daily" : `Every ${step} Days`,
      resetDescription: step === 1 ? "tomorrow at 12:00 AM" : `within ${step} days`,
    };
  }

  // Daily: all date fields are wildcards, hour/min are fixed
  if (dom === "*" && month === "*" && dow === "*") {
    const timeHour = parseInt(hour, 10) || 0;
    const timeMin = parseInt(min, 10) || 0;
    const ampm = timeHour >= 12 ? "PM" : "AM";
    const displayHour = timeHour % 12 || 12;
    const displayMin = String(timeMin).padStart(2, "0");
    return {
      label: "Daily",
      resetDescription: `tomorrow at ${displayHour}:${displayMin} ${ampm}`,
    };
  }

  return { label: "Periodic", resetDescription: "the next scheduled reset" };
}
