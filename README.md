# ⛺ Camp Weather Bot

Camp Weather Bot is a lightweight, automated Discord bot designed to post weather forecasts, daily summaries, tide info, marine alerts, and astronomy data for a specific location — optimized for camps, waterfronts, and outdoor organizations.

---

## 🌤️ What It Does

### 📅 Scheduled Forecasts
The bot posts **real-time forecast summaries** three times per day:
- **7:00 AM** — Morning forecast
- **12:00 PM** — Midday forecast
- **5:00 PM** — Evening forecast into the overnight

Each forecast includes:
- Forecast window time (e.g., "12:00 PM → 5:00 PM")
- Temperature range (°F and °C)
- Wind speed range (mph and m/s), with average direction
- Wave height range (ft and m)
- Water temperature (°F and °C)
- General sky conditions (e.g., Mostly Sunny, Overcast)
- Tide chart (next 3–4 highs/lows)
- Sunrise and sunset times
- Moon phase with emoji
- Next forecast posting time

Posts are formatted for **mobile readability** with smart line spacing and inline field optimization.

---

### 📊 Daily Weather Summary
At **12:01 AM** each day, the bot posts a full-day summary for the previous calendar date. The embed includes:
- High and low air temperature
- Max wind speed and wave height
- Average water temperature
- Sky condition summary
- Whether a marine advisory was issued that day

---

### ⚠️ Marine Advisory Alerts
Every 5 minutes, the bot checks NOAA’s API for **Small Craft Advisories** and similar alerts. When a new advisory is issued:
- A custom alert embed is posted in the configured channel
- The bot includes the advisory headline, zone, expiration time, and instructions
- Repeats are avoided using persistent alert ID storage

---

### 🔁 Rate-Limited API Handling
The bot uses **two StormGlass API keys** with automatic fallback logic. If the primary key hits its daily quota or rate limit, the bot retries using the secondary key.

---

## ✅ Designed For:
- Camp administrators
- Outdoor education programs
- Boating & sailing clubs
- Coastal safety teams
- Anyone needing daily weather at a glance

---

*Weather data sourced from [StormGlass.io](https://stormglass.io) and [weather.gov](https://weather.gov).*
