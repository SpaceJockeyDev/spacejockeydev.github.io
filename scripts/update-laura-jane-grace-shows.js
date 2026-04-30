import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const TOUR_URL = "https://www.laurajanegrace.com/tour";
const ARTIST_NAME = "Laura Jane Grace";
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

  const cleaned = raw
    .replace(/\./g, "")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = cleaned.split(" ");
  if (tokens.length < 3) {
    return null;
  }

  const monthKey = tokens[0].slice(0, 3).toLowerCase();
  const month = MONTHS[monthKey];
  const day = Number.parseInt(tokens[1], 10);
  const year = Number.parseInt(tokens[2], 10);

  if (!month || Number.isNaN(day) || Number.isNaN(year)) {
    return null;
  }

  return { year, month, day };
};

const parseLocation = (raw) => {
  if (!raw) {
    return { city: "", stateprovince: "", country: "" };
  }

  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return { city: "", stateprovince: "", country: "" };
  }

  if (parts.length === 1) {
    return { city: parts[0], stateprovince: "", country: "" };
  }

  const last = parts.at(-1) ?? "";
  const city = parts.slice(0, -1).join(", ");

  if (US_STATES.has(last)) {
    return { city, stateprovince: last, country: "United States" };
  }

  if (CA_PROVINCES.has(last)) {
    return { city, stateprovince: last, country: "Canada" };
  }

  return { city, stateprovince: "", country: last };
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
    description: null,
    website: event.ticketUrl || event.eventUrl || null,
    is_future_event: eventDate >= todayStart,
  };
};

const extractEvents = async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    await page.goto(TOUR_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".bit-event", { timeout: 20000 });

    const showAllDatesControl = page.locator("text=/Show All Dates|View All Dates|Show More/i");
    if (await showAllDatesControl.count()) {
      await showAllDatesControl.first().click();
      await page.waitForTimeout(1500);
    }

    const events = await page.$$eval(".bit-event", (rows) => {
      const getText = (parent, selector) =>
        parent.querySelector(selector)?.textContent?.trim() ?? "";

      const mappedRows = rows.map((row) => {
        const eventLink = row.querySelector("a[href*='bandsintown.com/e/']");
        const ticketLink =
          row.querySelector("a[href*='bandsintown.com/t/']") ||
          row.querySelector("a[href*='trigger=tickets']") ||
          row.querySelector(".bit-offers a[href]");

        return {
          dateText: getText(row, ".bit-date"),
          venueName: getText(row, ".bit-venue"),
          venueLocation:
            getText(row, ".bit-location-under-desktop") || getText(row, ".bit-location-under-tablet"),
          eventUrl: eventLink instanceof HTMLAnchorElement ? eventLink.href : "",
          ticketUrl: ticketLink instanceof HTMLAnchorElement ? ticketLink.href : "",
        };
      });

      const seen = new Set();
      return mappedRows.filter((row) => {
        if (!row.dateText || !row.venueName || !row.eventUrl) {
          return false;
        }
        if (seen.has(row.eventUrl)) {
          return false;
        }
        seen.add(row.eventUrl);
        return true;
      });
    });

    return events;
  } finally {
    await browser.close();
  }
};

const run = async () => {
  const events = await extractEvents();
  if (!events.length) {
    throw new Error("No events were found. Check the selector or page availability.");
  }

  const newShows = events
    .map((event, index) => buildShow(index + 1, event))
    .filter(Boolean);

  let existingShows = [];
  try {
    const fileContent = await fs.readFile(OUTPUT_PATH, "utf8");
    existingShows = JSON.parse(fileContent);
  } catch {
    console.log("No existing shows.json found, creating new file.");
  }

  const showKey = (show) => `${show.start_date}|${show.venue.venue}|${show.venue.city}`;

  const existingArtistShows = existingShows.filter((show) => show.title === ARTIST_NAME);
  const existingArtistKeys = new Set(existingArtistShows.map(showKey));
  const uniqueNewShows = newShows.filter((show) => !existingArtistKeys.has(showKey(show)));

  const nonArtistShows = existingShows.filter((show) => show.title !== ARTIST_NAME);

  const allShows = [...nonArtistShows, ...existingArtistShows, ...uniqueNewShows].map((show, index) => ({
    ...show,
    index: index + 1,
  }));

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(allShows, null, 2)}\n`, "utf8");

  console.log(
    `Updated ${OUTPUT_PATH} with ${allShows.length} total shows (added ${uniqueNewShows.length} new ${ARTIST_NAME} shows).`,
  );
};

run().catch((error) => {
  console.error("Failed to update shows:", error);
  process.exitCode = 1;
});
