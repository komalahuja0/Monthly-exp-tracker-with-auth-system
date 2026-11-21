export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const currency = (n) => {
  const value = Number.isFinite(n) ? n : 0;
  const formatted = Math.abs(value).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  return `${value < 0 ? "−" : ""}₹${formatted}`;
};

export const initials = (name = "") =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() || "")
    .join("") || "?";
