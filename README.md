# Fastest Finger First - Multiplayer Game ⚡

A real-time, premium multiplayer game based on the famous **"Fastest Finger First"** round. Perfect for hosting friendly quizzes, team games, or practice sessions. It is designed to be hosted easily on **Render** using a lightweight JSON database.

## 🚀 Features

- **Host Dashboard**:
  - Automatically generates a unique 4-character game code.
  - Live player lobby showing joining players in real-time (up to 7 players).
  - Scrollable **Question Bank** containing default standard questions.
  - **Custom Question Creator** modal to add your own questions on the fly.
  - Controls to **Launch Question**, track real-time player submission status, and manually/automatically **End Question**.
  - **Live Leaderboard** displaying players ranked by response accuracy and precise speed (milliseconds). Incorrect/unsubmitted answers are highlighted in **red**.

- **Player Interface**:
  - Responsive layout for desktop and mobile devices.
  - Interactive **Sequence Arranger** workspace (tap/click cards to order them).
  - Sync'd Countdown Timer bar.
  - Live ranking and result screens displaying answers of all players.

- **JSON Database**:
  - Uses `db.json` to store custom questions and save game history/leaderboards. No complex databases required!

---

## 🛠️ Local Installation & Development

To run this application on your local machine:

1. **Install Node.js** (v18 or higher recommended).
2. **Navigate** to this project directory:
   ```bash
   cd "Faster finger first"
   ```
3. **Install Dependencies**:
   ```bash
   npm install
   ```
4. **Start the Server**:
   ```bash
   npm start
   ```
5. Open your browser and navigate to:
   - **Host Screen**: `http://localhost:3000/host.html`
   - **Player Screen**: `http://localhost:3000/`

---

## ☁️ Deploying to Render

Deploying this app to [Render](https://render.com/) is straightforward:

1. **Upload the Code to GitHub**:
   - Initialize a git repository: `git init`
   - Stage and commit files: `git add .` & `git commit -m "Initial commit"`
   - Push to your GitHub repository.

2. **Create a New Web Service on Render**:
   - Go to [Render Dashboard](https://dashboard.render.com/) and click **New > Web Service**.
   - Connect your GitHub repository.

3. **Configure the Service Settings**:
   - **Name**: `fastest-finger-first` (or any custom name)
   - **Language**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Select **Free** Tier.

4. **Add Disk Persistence (Optional but Recommended)**:
   - Since Render's file system is ephemeral, if you restart the service, any added custom questions in `db.json` will be reset.
   - To persist custom questions, you can attach a **Render Disk** (Mount Path: `/opt/render/project/src`, or store `db.json` on a persistent volume). Alternatively, simply write them directly in `questions.json` before deploying.

---

## 📝 Game Questions Included

The following 5 standard questions are pre-packaged:

1. **Alphabetical Order**: ATM, GST, PAN, RBI
2. **Chronological Days**: Monday, Wednesday, Friday, Sunday
3. **Calendar Months**: January, April, August, December
4. **Ascending Numbers**: 25, 50, 75, 100
5. **Rainbow Color Order**: Red, Yellow, Green, Blue
