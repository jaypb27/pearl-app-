# PEARL App — Setup & User Guide

**Proficiency in English and Reading Literacy Program**
*Reading with purpose, speaking with confidence.*
Developed by **Joy P. Bacala**, Samal Senior High School

## ⚡ Quick Start (first-time setup, about 30 minutes)

| Step | Where | What to do |
|---|---|---|
| 1 | Google Sheets | Create a blank sheet named **PEARL App Database** → **Extensions → Apps Script**. |
| 2 | Apps Script | Delete the sample code, paste all of **`Code.gs`**, **Save**, run **`initialize`** once and click **Allow**. |
| 3 | Apps Script | **Deploy → New deployment → Web app**. Execute as **Me**, Who has access **Anyone**, then **Deploy** and copy the **`/exec`** link. |
| 4 | Browser test | Open the `/exec` link in an **Incognito** window. It must show `{"ok":true,"app":"PEARL App database"…}`. |
| 5 | GitHub | Upload everything from **PEARL-App-FULL.zip** to your repository, then **Settings → Pages → main / (root) → Save**. |
| 6 | GitHub | Edit **`config.js`**, paste your `/exec` link between the quotes, and **Commit**. |
| 7 | PEARL App | Open your site → **Teacher** → the **Welcome** screen → create the coordinator account (keep "Load the 120 PEARL lessons" checked). |
| 8 | PEARL App | **Settings:** logos, signatories, School Year, teacher accounts and their sections. **Learners:** **Import list**. **Tests:** open the pre-test. |
| 9 | Learners | Share the app link. Learners open it on Wi-Fi, tap **Install app** and **Update data**, then log in with their LRN and PIN (last 4 digits of the LRN). |

### Updating to a newer version later
1. Apps Script: paste the new `Code.gs` → **Save** → **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. The link stays the same.
2. GitHub: upload the files from **PEARL-App-UPDATE.zip**. It has **no `config.js`**, so your link is never erased.
3. Close and reopen the app (or press Ctrl + Shift + R).

### If the app says "Database not reachable" or "Offline" while you have internet
Open your `/exec` link in an **Incognito** window:
- **Sign-in page or "You need access":** set Who has access to **Anyone** and deploy a **New version**.
- **"Script function not found":** paste and **Save** `Code.gs`, then deploy a **New version**.
- **"Authorization is required":** run `initialize` in the editor, click **Allow**, then deploy a **New version**.
- **"Anyone" isn't in the list:** your DepEd account blocks it. Deploy from a personal Gmail account and update `config.js`.

---

The PEARL App puts the daily 25-minute PEARL routine on learners' phones. It has:

- **Levels:** Beginner, Intermediate and Advanced, each with its own lessons.
- **Daily steps:** Words → Read → Quiz → Write → Speak (audio recording).
- **Offline use:** learners can work with no internet. Their answers and recordings wait on the phone and upload automatically when the phone is back online.
- **Teacher tools:** monitoring per learner, per section and for the whole school; WATCH (first to submit); Most Improved; pre-test and post-test; releveling exams; reports with the school letterhead.
- **Lessons included:** the 120 PEARL lessons (Weeks 1–8, Days 1–40, all three levels), taken from the PEARL modules. All 120 answer keys were checked against Appendix B of the Implementation Manual.

**How the data works.** The Google Sheet is the database (storage only). All adding and editing is done inside the app.

---

## What's in this folder

| File / folder | What it is |
|---|---|
| `Code.gs` | The database program (Google Apps Script). It goes into your Google Sheet. |
| `index.html`, `css/`, `js/`, `icons/`, `manifest.webmanifest`, `sw.js` | The app itself. It goes on GitHub Pages. |
| `config.js` | Paste your Web App URL here so the app connects automatically. |
| `js/checker.js` | The Smart Checker: quiz explanations, writing rubric, test suggestions. |
| `default-content.js` | The 120 PEARL lessons and 4 sample tests. |
| `gas-shim.js`, `demo-server.js` | Used only by **Demo Mode**. Keep them in the folder. |

---

## PART A — Create the database (Google Sheet + Apps Script) · about 10 minutes

1. Go to **sheets.google.com** and create a blank spreadsheet. Name it **PEARL App Database**.
   > Use a Google account with enough Drive space for the recordings (see *Storage* below).
2. Click **Extensions → Apps Script**.
3. Delete the sample code. Open `Code.gs` from this folder, copy **all** of it, and paste it in. Click **💾 Save**.
4. In the function dropdown at the top, choose **`initialize`** and click **▶ Run**.
   - Google will ask for permission. Click **Review permissions**, choose your account, then **Advanced → Go to project (unsafe) → Allow**.
     (The script is yours. Google shows this warning for every new script.)
   - This creates the sheet tabs (Settings, Users, Students, Lessons, Assessments, Daily, Results, Grades, LevelHistory). It also creates a Drive folder named **PEARL App Audio Recordings**.
5. Click **Deploy → New deployment**. Click the ⚙ gear and choose **Web app**, then set:
   - Description: `PEARL App v1`
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Click **Deploy**, then **copy the Web App URL**. It ends in `/exec`.

> ⚠ **If "Anyone" is not in the list:** your DepEd/Workspace account may be blocking public access. Without "Anyone", learners can't connect, so deploy from a personal Gmail account instead.

> ⚠ **Do not type or edit inside the sheet tabs.** Make every change in the app.

---

## PART B — Put the app online (GitHub Pages, free) · about 10 minutes

1. Create a free account at **github.com**, if you don't have one.
2. Click **＋ → New repository**. Name it `pearl-app`, choose **Public**, and click **Create repository**.
3. Click **uploading an existing file**. Drag **all the files and folders** from this PEARL App folder into the page, then click **Commit changes**.
   Make sure the `css`, `js` and `icons` folders upload too.
4. *(Recommended)* Open `config.js` on GitHub and click ✏️ to edit. Paste your Web App URL between the quotes:
   ```js
   apiUrl: 'https://script.google.com/macros/s/AKfycb.../exec'
   ```
   Then click **Commit changes**. After this, everyone who opens the app connects to your school automatically.
5. Go to **Settings → Pages**. Under *Branch*, choose **main** and **/ (root)**, then click **Save**.
6. Wait 1–2 minutes. Your app is now at **`https://YOUR-USERNAME.github.io/pearl-app/`**.

---

## PART C — First-time setup (Program Coordinator)

1. Open your app link. If you skipped step B4, paste the Web App URL and tap **Connect**.
2. The **Welcome** screen appears. Enter:
   - the school details
   - your name, a username and a password, for the **Program Coordinator (admin)** account
3. Leave **"Load the 120 PEARL lessons…"** checked and tap **Create & Start**.
4. In **⚙ Settings**:
   - Upload the **DepEd seal**, **school logo** and **program logo**, and fill in the **signatories**.
   - Set **Released up to Day**. Learners can open only lessons up to this day. Raise it as the weeks go on.
   - Check the minimum words, recording goal, points (50/50/50) and placement bands.
   - Add **teacher accounts**. Give each teacher their sections, or **ALL** for ARAL facilitators.
5. In **👥 Learners**, tap **⇪ Import list**. Copy rows from your Excel or Google Sheets class list and paste them. The columns must be in this order:
   `LRN · Last name · First name · Middle name · Sex · Grade · Section · Level`
   You can write the level as Beginner/Intermediate/Advanced or as Emerging/Developing/At Grade Level.
6. Tap **🪪 Print login cards** and hand them out.
   Each learner logs in with their **LRN**. Their **PIN** is the last 4 digits of their LRN; learners can change it inside the app.
7. In **Settings → 🔗 Learner link**, copy the link and post it in each section's Messenger group chat.

---

## PART D — Learners: install once, then use offline

1. While on Wi-Fi, open the link in **Chrome**.
2. Tap **📲 Install app**, or use Chrome's menu → **Add to Home screen**.
3. Tap **⬇ Download / update data** once. All lessons are now on the phone.
4. Log in with **LRN + PIN**, then follow the daily pearl:
   - **📖 Words:** flip the cards, listen, and say each word aloud.
   - **📰 Read:** read the passage aloud. Tap a highlighted word to see its meaning.
   - **✅ Quiz:** 5 questions, with feedback after each one.
   - **✍️ Write:** answer the discussion questions. The vocabulary chips light up when a word is used.
   - **🎙️ Speak:** record yourself reading your answers (goal: 1 minute), then do the self-reflection. A learner without a mic or phone taps *"I will read aloud to my teacher."*
5. Tap **Submit my pearl 🐚**. If there's no internet, it shows **⬆ 1 to upload** and sends by itself later.

Learners collect **pearls**, **points**, **streaks** and **badges**. They also see the **WATCH board** (first to finish) and their **Voice Journey**, which compares their first and latest recordings.

---

## PART E — Smart Checker (saves teachers' time)

The app checks work **on its own, without outside AI**. It works offline, costs nothing, and no learner data leaves your database.

| What | How it is checked | What learners / teachers see |
|---|---|---|
| **Comprehension quiz** | Automatically, using the answer key for the learner's level | Right after each answer, learners see **💡 Why**: the word's definition (vocabulary items) or the **sentence in the passage** that proves the answer. Teachers can type their own explanation per question in **Materials → Edit**. |
| **Written answers** | A rubric of 3 parts, 1–4 points each (12 total): **Content** (complete, on-topic, in their own words), **Vocabulary** (how many of the day's words were used), **Mechanics** (capital letters, periods, "I", repeated words) | Learners get **Writing Coach** tips while they type. Teachers see the suggested score **with the reasons**, plus flags: *copied from the passage*, *short*, *blank*, *same answer twice*, *very similar to a classmate*. |
| **Test short answers** | Put the **accepted answers** in the test builder and the item is scored automatically | — |
| **Test essays / short answers** | Put the **expected ideas/keywords** in the test builder | The app suggests points with reasons ("found 3 of 4 ideas; missing: …"). **Use all suggestions** fills them in for you. |

**✅ Checking tab:** all unchecked work is listed, with flagged work first. Open the flagged ones, then select the rest and tap **Accept suggestions for selected**. The learner sees your comment and writing score.

> The checker looks at **completeness, vocabulary use, mechanics and copying**. It can't judge how deep or true an idea is the way a teacher can, so its score is a *suggestion*. You can always change it.

> **Why not Google Gemini / ChatGPT-style AI?** Google's Gemini API terms do not allow apps that are used by people under 18, and its free tier must not receive personal information. A grading AI would read learners' written answers, so the school would need a paid AI service whose terms allow learners under 18, plus the consent required under the Data Privacy Act. The PEARL App can be extended for that later.

---

## PART F — Protection against leaking (v1.2)

| Feature | What happens |
|---|---|
| **One phone per learner** | A learner's account is locked to the **first phone they log in on**. Logging in on another phone is blocked and recorded. If a learner changes phones, a teacher taps **Reset phone** (in **Learners**, or in the learner's profile). |
| **One learner per phone** | A phone registered to one learner can't be used by another. For a **shared classroom phone** (e.g. the teacher's phone used by learners without phones), open **🛡 Security** and tap **Mark as shared**. |
| **Watermark** | Lessons, reviews and tests show a faint watermark with the learner's **name, LRN and date**, so any leaked photo shows who leaked it. |
| **No copying or printing** | Selecting, copying and printing PEARL materials are turned off. Attempts are recorded. |
| **Leaving the app** | The lesson **pauses and blurs** when the learner switches to another app. Each exit is recorded. In **tests**, the test is **submitted automatically** after a set number of exits (default 3; change it in Settings). |
| **🛡 Security tab** | Phones used by 2 or more learners, blocked logins, how many times each learner left the app, screenshot-key/copy/print attempts, and recent events. |

> ⚠ **What no web app can do:** a website or installed web app can't block screenshots or screen recording, and it can't close other apps. Phones and browsers don't allow it; only native Android apps can do this. The watermark and the activity log make leaks traceable instead.

> **Changing phones:** if a learner uninstalls the app, clears Chrome's data, or uses a different browser, the phone looks new. A teacher then taps **Reset phone** once.

## PART G — Releveling: pass to move up, fail to restart

In **Tests → (releveling exam) → Results**, check the written/oral items first, then tap **⬆ Apply results**:

- learners who **passed** move up to the next level and continue
- learners **below the passing score** stay in their level and **restart from Day 1** (Round 2)

Their earlier work is kept in the records as Round 1, while the progress chart and completion show the new round. On their phone they see *"Fresh start!"*, and they can take the releveling exam again only after finishing the released days. You can also restart any learner by hand with **Restart Day 1**.

---

## PART H — Teachers' checking progress & recognition (v1.3)

**Who checks what:** a teacher is the **assigned checker** for the sections in their account (**Settings → Teacher accounts → Sections**). Accounts set to **ALL** (coordinator, ARAL facilitators) monitor everything and are not counted as assigned checkers. Sections with no checker are flagged **Unassigned**.

- **✅ Checking** shows a progress bar of your sections' work that has been checked, plus an **Assigned to** column for each submission.
- **🏅 Teachers** (open to every teacher) shows:
  - **Your checking progress**: the % of your assigned sections' work that has been checked
  - **Teachers' checking progress**: for each teacher, the % of assigned work checked, how many they checked themselves, personal comments written, median time from submission to checking, and their learners' completion
  - **Checking assignments by section**: assigned teacher(s), % checked, work waiting, and the oldest unchecked item (red if over 3 days)
- **Recognition awards** for the chosen period (this week, 30 days, 90 days, or school year), each with a printable **Certificate of Recognition** carrying the letterhead and the coordinator's and principal's signatures:
  - **Most Productive Checker**: checked the most learners' work
  - **Fastest Feedback**: shortest median time to check (at least 10 checks)
  - **100% Checker**: checked all work in the assigned sections (at least 10)
  - **Most Encouraging Teacher**: wrote the most personal comments
  - **Most Engaged Sections**: highest learner completion in the assigned sections
- **Print report** gives the Teachers' Checking Progress Report: per teacher, per section, and the awardees.

A check is counted when a teacher saves feedback on a learner's work, scores a test, or accepts the suggested scores.

**Two or more teachers in one section (v1.4):** add the same section to both teachers' accounts. Then go to **Settings → Splitting the checking** and choose how to divide that section's work:

| Split | How it works |
|---|---|
| **By level** | Tick the levels each teacher checks, e.g. Teacher A: Beginner; Teacher B: Intermediate + Advanced. |
| **By learner name** | Give each teacher a range of last names, e.g. A–M and N–Z. **Fill evenly** divides A–Z for you. |
| **By day** | Teacher 1 checks odd days (1, 3, 5…) and Teacher 2 checks even days (2, 4, 6…). With 3 teachers it rotates every 3 days. **Rotate order** swaps who starts. Tests are shared in this mode. |
| **Shared** | Both teachers see all of the section's work (the default). |

Each teacher then has their **own queue** in ✅ Checking (**Assigned to me**; **All my sections** shows the whole section) and their **own progress %**. The Teachers tab shows each teacher's share, e.g. *Maria Santos: 84% (21/25) · Liza Garcia: 100% (15/15)*. The card also shows how many learners each teacher gets. Learners not covered by the split (e.g. a level nobody ticked) are shared by all of the section's teachers, so nothing is left unchecked.

---

## PART I — School years: keep every year's records (v1.5)

Each school year has its own learners and records, and **nothing is deleted**.

**At the end of the school year** (Program Coordinator): go to **Settings → School years → Start a new school year**.
1. Type the new school year (e.g. *2027–2028*).
2. Choose the learners for the new year:
   - **Start with an empty list:** import the new list.
   - **Keep Grade 11 learners as Grade 12:** their sections are cleared, so re-import to set them. Grade 12 learners are treated as graduated.
   - **Keep all learners:** only their work is cleared.
3. Confirm. The app then:
   - saves a **complete copy** of the database (learners, daily work, test results, checking, levels, phone logins, lessons, settings) as **"PEARL Archive — SY 2026–2027"** in the Drive folder *PEARL App School Year Archives*
   - **checks the copy row by row** before clearing anything; if the check fails, nothing is cleared
   - starts the new year with no submissions, all tests closed, *Released up to Day* set to 1, and the same lessons, teacher accounts and settings

**Reviewing a past year anytime:** use the **School year** menu at the top of the teacher sidebar, or **Settings → School years → View**. A yellow bar shows you are viewing an archived year.
- Every tab works for that year: dashboard, progress chart, learners' work and recordings, tests, teachers' progress, security, and all reports with that year's letterhead.
- Records can't be changed, but you **can still finish checking** last year's work.
- **Sheet** opens the archive file in Google Sheets.

**Nothing gets lost:**
- Work a learner finished offline last year but uploads after the new year started goes into **last year's archive**, not the new year.
- Learners' progress on their phones is kept separately for each school year, so returning learners start the new year fresh at Day 1.
- Recordings are filed in Drive by school year: *PEARL App Audio Recordings → SY 2027–2028 → Beginner…*

---

## PART J — Teachers' daily monitoring

| Tab | What you can do |
|---|---|
| **📊 Dashboard** | Completion %, average quiz, learners by level, completion per section, **WATCH: First to Submit** (per day), **Most Improved** (pre→post or quiz trend), no activity in 5+ days, needs support, ready for releveling |
| **🏅 Teachers** | Assigned checkers, % checked per teacher and section, recognition awards and certificates. |
| **🛡 Security** | Phone and login monitoring, shared phones, leaving-the-app counts. |
| **✅ Checking** | Unchecked daily work and tests in one list, flagged items first. Accept the suggested scores in one tap. |
| **🗓 Progress Chart** | The digital wall chart: quiz score, ✍ written and 🎙 audio for each day. Tap a name to open the learner's work, **play the recording**, and give **feedback** (accuracy, expression, pace, stars, comment). Learners see your comment. |
| **👥 Learners** | Add, edit, import, set level, reset PIN, print login cards |
| **📝 Tests** | Pre-test, post-test, releveling exams, monthly long quizzes, term exams. Item types: multiple choice, short answer, essay, **spelling dictation**, **oral reading recording**. *Add items from a PEARL lesson* imports a lesson's passage and questions in one tap. Tick **Open to learners** to release a test. |
| **📚 Materials** | Edit any lesson in the six-part format, add new days or **extra readings**, import or export lessons (JSON) |
| **🖨 Reports** | Progress Chart, Audio Tracker, Completion Summary, WATCH Report, Most Improved, Points Summary, **Class Literacy Assessment Summary** (current, pre-test or post-test; by section and sex), Releveling Report. Each one prints with the school letterhead and signatories. |

**Releveling (moving up a level):** open the releveling exam's **Results**, check the essay and oral items, then tap **⬆ Promote passers**. Promoted learners get next-level lessons from their next pearl on.

**Pre-test placement:** in the pre-test **Results**, tap **🎯 Apply level placement**. It sets each learner's level using the bands in Settings.

> The pre-test and post-test included are **samples** built from PEARL vocabulary items. Edit them or replace them with your official instrument.

---

## Replicating in other schools

Every school uses **its own copy** of the database:

1. Do **Part A** with that school's Google account. This gives them their own Sheet, Drive folder and Web App URL.
2. Either do **Part B** with their own GitHub account, or reuse the same app link and add `?api=THEIR_WEB_APP_URL` to the end. For example:
   `https://YOUR-USERNAME.github.io/pearl-app/?api=https://script.google.com/macros/s/XXXX/exec`
3. On first open they see the **Welcome** screen, where they enter their school name, ID, address, region and division. They can then upload their own logos and signatories in **Settings**.
4. To share materials, use **Materials → Export** at your school and **Import** at theirs.

---

## Storage, limits and tips

- **Recordings** are saved in your Drive folder *PEARL App Audio Recordings*, one sub-folder per level. A 1-minute recording is about **180 KB**. For 400 learners × 40 days that comes to about **3 GB**, so use an account with enough Drive space.
- **400 learners at once:** Google limits how many requests run at the same time. When it's busy, the app retries by itself, with random waits, until everything uploads.
- **Learners' PINs** are stored scrambled (hashed), never as plain text. Only signed-in teachers can play recordings.
- **WATCH times** come from the moment the learner finished on their phone, so working offline still counts. ⚠ marks a phone whose clock looks wrong.
- **Updating to v1.5:** paste the new `Code.gs`, deploy a **New version**, and upload all app files to GitHub. The first time you start a new school year, Google may ask you to allow the script to create files in Drive (for the archive copy). Click **Allow**.
- **Updating to v1.4:** paste the new `Code.gs`, deploy a **New version**, and upload all app files to GitHub.
- **Updating to v1.3:** paste the new `Code.gs`, deploy a **New version**, and upload all app files to GitHub. Work checked before v1.3 is credited to the teacher by name.
- **Updating to v1.2:** paste the new `Code.gs`, then **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**, and upload all app files to GitHub. New columns (Device, Cycle) and a **Logins** sheet are added automatically. Each learner's phone is registered at their next login.
- **Updating from v1.0 to v1.1:** paste the new `Code.gs` over the old one, then do **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**, and upload the new app files to GitHub. The new *AutoCheck* column is added to the Daily sheet automatically.
- **Updating Code.gs later:** go to **Deploy → Manage deployments → ✏️ Edit → Version: New version → Deploy**. The URL stays the same.
- **Updating the app files:** upload the new files to GitHub. Phones get the update the next time they open the app online.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Could not connect" | Check that the URL ends in `/exec` and that access is set to **Anyone**. |
| A learner sees "LRN not found" | The learner must be in **Learners**. Then the learner taps **Download / update data** while online. |
| "Wrong PIN" | A teacher uses **Learners → Reset PIN**. With the box left blank, the PIN goes back to the last 4 digits of the LRN. |
| Microphone blocked | In Chrome: **⋮ → Settings → Site settings → Microphone → Allow** for the app. Or choose *read aloud to teacher*. |
| "⬆ 3 to upload" never clears | Connect to the internet and tap the chip to sync now. Items stay safely on the phone until they upload. |
| Changing devices | The learner logs in on the new phone while online. Their finished pearls download from the database. |

---

*PEARL App v1.5.1 · Developed by Joy P. Bacala, Samal Senior High School · For Samal Senior High School and any school implementing the PEARL Program.*
