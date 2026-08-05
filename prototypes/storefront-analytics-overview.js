const analyticsByRange = {
  7: {
    visitors: "684", visitorsChange: "+8%",
    registration: "64%", registrationChange: "+2%",
    consultation: "51%", consultationChange: "+3%",
    booking: "43%", bookingChange: "+2%",
    return7: "35%", return7Change: "Up 2%",
    return30: "21%", return30Change: "Up 1%",
    journey: [
      ["Visited the storefront", "People who arrived", 684, 100],
      ["Started registration", "Interested in creating an account", 286, 42],
      ["Completed registration", "Successfully created an account", 183, 27],
      ["Sent consultation", "Asked Nevari for care", 94, 14],
      ["Booked appointment", "Selected an available time", 40, 6],
      ["Completed payment", "Became a paying customer", 35, 5]
    ]
  },
  30: {
    visitors: "2,486", visitorsChange: "+12%",
    registration: "68%", registrationChange: "+4%",
    consultation: "54%", consultationChange: "+7%",
    booking: "46%", bookingChange: "+5%",
    return7: "38%", return7Change: "Up 5%",
    return30: "24%", return30Change: "Up 3%",
    journey: [
      ["Visited the storefront", "People who arrived", 2486, 100],
      ["Started registration", "Interested in creating an account", 1084, 44],
      ["Completed registration", "Successfully created an account", 737, 30],
      ["Sent consultation", "Asked Nevari for care", 398, 16],
      ["Booked appointment", "Selected an available time", 183, 7],
      ["Completed payment", "Became a paying customer", 156, 6]
    ]
  },
  90: {
    visitors: "7,942", visitorsChange: "+18%",
    registration: "71%", registrationChange: "+6%",
    consultation: "57%", consultationChange: "+9%",
    booking: "49%", bookingChange: "+6%",
    return7: "41%", return7Change: "Up 7%",
    return30: "29%", return30Change: "Up 5%",
    journey: [
      ["Visited the storefront", "People who arrived", 7942, 100],
      ["Started registration", "Interested in creating an account", 3652, 46],
      ["Completed registration", "Successfully created an account", 2593, 33],
      ["Sent consultation", "Asked Nevari for care", 1478, 19],
      ["Booked appointment", "Selected an available time", 724, 9],
      ["Completed payment", "Became a paying customer", 631, 8]
    ]
  }
};

const devices = [["Mobile", 62], ["Desktop", 31], ["Tablet", 7]];
const roles = [["Patients", 72], ["Doctors", 16], ["Pharmacists", 8], ["Nurses", 4]];

function formatNumber(value) {
  return new Intl.NumberFormat("en-NG").format(value);
}

function renderBreakdown(targetId, rows) {
  const target = document.getElementById(targetId);
  target.replaceChildren(...rows.map(([label, value]) => {
    const row = document.createElement("div");
    row.className = "breakdown-row";
    row.innerHTML = `
      <span>${label}</span>
      <div class="bar-track" aria-hidden="true"><div class="bar-fill" style="--width:${value}%"></div></div>
      <strong>${value}%</strong>
    `;
    return row;
  }));
}

function renderJourney(rows) {
  const journey = document.getElementById("journey");
  journey.replaceChildren(...rows.map(([label, description, total, percentage]) => {
    const step = document.createElement("div");
    step.className = "journey-step";
    step.innerHTML = `
      <div class="journey-label"><strong>${label}</strong><span>${description}</span></div>
      <div class="bar-track" aria-hidden="true"><div class="bar-fill" style="--width:${percentage}%"></div></div>
      <div class="journey-value"><strong>${formatNumber(total)}</strong><span>${percentage}% of visitors</span></div>
    `;
    return step;
  }));
}

function setRange(range) {
  const data = analyticsByRange[range];
  document.querySelectorAll("[data-field]").forEach((element) => {
    element.textContent = data[element.dataset.field];
  });
  document.querySelectorAll(".range-button").forEach((button) => {
    const active = button.dataset.range === String(range);
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  renderJourney(data.journey);
}

document.querySelectorAll(".range-button").forEach((button) => {
  button.addEventListener("click", () => setRange(Number(button.dataset.range)));
});

renderBreakdown("device-breakdown", devices);
renderBreakdown("role-breakdown", roles);
setRange(30);
