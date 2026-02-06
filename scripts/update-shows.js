import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const TOUR_URL = "https://themenzingers.com/pages/tour";
const ARTIST_NAME = "The Menzingers";
const OUTPUT_PATH = path.resolve(process.cwd(), "shows.json");
const DEFAULT_TIME = "08:00:00";

const MONTHS = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

const US_STATES = new Set([
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
  "DC",
]);

const CA_PROVINCES = new Set([
  "AB",
  "BC",
  "MB",
  "NB",
  "NL",
  "NS",
  "NT",
  "NU",
  "ON",
  "PE",
  "QC",
  "SK",
  "YT",
]);

const pad = (value) => String(value).padStart(2, "0");

const formatDate = (year, month, day) => {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
};

const parseDate = (raw) => {
  if (!raw) {
    return null;
  }
  const cleaned = raw.replace(/\s+/g, " ").trim().replace(/,/g, "");
  const parts = cleaned.split(" ");
  if (parts.length < 3) {
    return null;
  }
  const monthKey = parts[0].slice(0, 3).toLowerCase();
  const month = MONTHS[monthKey];
  const day = Number.parseInt(parts[1], 10);
  const year = Number.parseInt(parts[2], 10);
  if (!month || Number.isNaN(day) || Number.isNaN(year)) {
    return null;
  }
  return { year, month, day };
};

const parseLocation = (raw) => {
  if (!raw) {
    return { city: "", stateprovince: "", country: "" };
  }
  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) {
    return { city: "", stateprovince: "", country: "" };
  }
  if (parts.length === 1) {
    return { city: parts[0], stateprovince: "", country: "" };
  }
  const stateprovince = parts.at(-1) ?? "";
  const city = parts.slice(0, -1).join(", ");
  let country = "United States";
  if (CA_PROVINCES.has(stateprovince)) {
    country = "Canada";
  } else if (!US_STATES.has(stateprovince)) {
    country = "";
  }
  return { city, stateprovince, country };
};

const buildShow = (index, event) => {
  const parsedDate = parseDate(event.dateText);
  if (!parsedDate) {
    return null;
  }
  const { year, month, day } = parsedDate;
  const startDate = `${year}-${pad(month)}-${pad(day)} ${DEFAULT_TIME}`;
  const formattedDate = formatDate(year, month, day);
  const venueLocation = parseLocation(event.venueLocation);
  const description = event.details ? `<p>${event.details}</p>` : null;
  const eventDate = new Date(`${year}-${pad(month)}-${pad(day)}T00:00:00`);
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  return {
    index,
    title: ARTIST_NAME,
    start_date: startDate,
    formatted_date: formattedDate,
    venue: {
      city: venueLocation.city,
      stateprovince: venueLocation.stateprovince,
      country: venueLocation.country,
      venue: event.venueName || "",
    },
    description,
    website: event.ticketUrl || null,
    is_future_event: eventDate >= todayStart,
  };
};

const extractEvents = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.goto(TOUR_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".seated-event-description-cells", { timeout: 20000 });

    const events = await page.$$eval(
      ".seated-event-description-cells",
      (cells) =>
        cells.map((cell) => {
          const getText = (selector) => {
            const el = cell.querySelector(selector);
            return el?.textContent?.trim() ?? "";
          };

          const container = cell.closest(".seated-event") ?? cell.parentElement;
          let ticketUrl = "";
          if (container) {
            const ticketLink = container.querySelector(
              ".seated-event-ticket-cell a[href], a.seated-event-ticket-link[href], a[href*='link.seated.com'], a[href*='seated.com']",
            );
            if (ticketLink instanceof HTMLAnchorElement) {
              ticketUrl = ticketLink.href;
            }
          }

          return {
            dateText: getText(".seated-event-date-cell"),
            venueName: getText(".seated-event-venue-name"),
            venueLocation: getText(".seated-event-venue-location"),
            details: getText(".seated-event-details-cell"),
            ticketUrl,
          };
        }),
    );

    return events.filter((event) => event.dateText && event.venueName);
  } finally {
    await browser.close();
  }
};

const run = async () => {
  const events = await extractEvents();
  if (!events.length) {
    throw new Error("No events were found. Check the selector or page availability.");
  }

  const shows = events
    .map((event, index) => buildShow(index + 1, event))
    .filter(Boolean);

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(shows, null, 2)}\n`, "utf8");

  console.log(`Updated ${OUTPUT_PATH} with ${shows.length} shows.`);
};

run().catch((error) => {
  console.error("Failed to update shows:", error);
  process.exitCode = 1;
});
