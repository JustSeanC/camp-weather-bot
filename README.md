# ⛺ Camp Weather Bot

Camp Weather Bot is an automated Discord bot that posts weather forecasts, marine alerts, and astronomy data tailored for waterfronts, camps, and outdoor communities.

---

## 🌤️ Features

### 🕒 Timed Forecasts (3x/day)
Posts forecast summaries at:
- **7:00 AM**
- **12:00 PM**
- **5:00 PM**

Each embed includes:

```
🌤️ Camp Tockwogh Forecast  
━━━━━━━━━━━━━━━━━━━━━━━  
📅 Date: July 5, 2025  
🕒 Current Time: 12:00 PM EDT / 16:00 UTC  
⏲️ Forecast Window: 12:00 PM → 5:00 PM EDT  
🔮 Next Forecast: 5:00 PM EDT / 21:00 UTC  

🌡️ Temperature:  
88°F → 92°F  
(31.1°C → 33.3°C)

💨 Wind:  
7.2 mph → 10.1 mph  
(3.2 m/s → 4.5 m/s)  
Direction: SE avg  

🌊 Wave Height:  
1.5 ft → 2.4 ft  
(0.46 m → 0.73 m)

🌡️ Water Temp:  
78.4°F (25.8°C)

🌥️ Sky Conditions:  
Mostly Sunny, Clear

🌊 Tides:  
High at 12:32 PM  
Low at 6:21 PM  
High at 12:45 AM

🌅 Sunrise / Sunset:  
6:04 AM / 8:31 PM

🌕 Moon Phase:  
🌔 Waxing Gibbous
```

---

### 📈 Daily Summary (12:01 AM)
Summarizes the previous day’s weather with high/low temps, wind/wave peak, and alerts:

```
📋 Daily Summary for July 4, 2025  
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  
🕒 Time range: 12:00 AM → 11:59 PM  

🌡️ High Temp: 91.2°F (32.9°C)  
🌡️ Low Temp: 72.5°F (22.5°C)  
💨 Max Wind: 11.3 mph (5.1 m/s)  
🌊 Max Waves: 2.8 ft (0.85 m)  
🌥️ Sky Conditions: Partly Cloudy  
🌡️ Avg Water Temp: 77.2°F (25.1°C)  
⚠️ Marine Alerts: A marine advisory was issued yesterday
```

---

### ⚠️ Marine Advisory Alerts (NOAA API)
Checks for Small Craft Advisories every **5 minutes**. If detected:

```
⚠️ Small Craft Advisory ⚠️  
━━━━━━━━━━━━━━━━━━━━━━━  
💬 Chesapeake Bay from North Beach to Drum Point  
📅 Issued: July 5, 2025 3:45 AM  
⏳ Expires: July 5, 2025 6:00 PM  

💡 Instructions:  
Boaters should remain in port or use extreme caution.
```

> No duplicate alerts are posted. Each new advisory is stored and checked against previous IDs.

---

## 🔧 Intelligent Features

- 🔁 **Fallback API key**: Two StormGlass API tokens with automatic retry on rate-limit
- 📅 Timezone-aware scheduling (EDT/EST)
- 📉 Min/Max forecasting by time block
- 📲 Optimized for mobile view

---

## ✅ Perfect For:
- Camp staff and directors
- Marine operations & sailing programs
- Waterfront safety teams
- Outdoor rec groups and event organizers

---

**Data from [StormGlass.io](https://stormglass.io) & [NOAA](https://weather.gov)**  
