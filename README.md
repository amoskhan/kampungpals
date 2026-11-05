<p align="center">
  <img src="assets/logo.svg" alt="Kampung Pals logo" width="96">
</p>

<h1 align="center">Kampung Pals</h1>

<p align="center">
  A map-making app for Outdoor Education lessons.<br>
  <a href="https://kampungpals.app"><strong>Open Kampung Pals</strong></a>
</p>

Students walk a real site and build an abstract map of it. Teachers set the Task, watch the maps take shape and give feedback on them. It runs in the browser on phones, tablets and computers, with nothing to install.

## What it does

**Students**

- Open a Task with a Task Code and choose their name, with no password. Anyone not on a Roster can join as a Guest.
- Draw Landmarks, Paths, Roads and Hazards. The Legend builds itself as they go.
- Work alone or in a Group, sharing one map. One device draws at a time, and others can ask for a turn.
- Hold a button to compare their map with a Reference Map.
- Hand in their map, read their Teacher's feedback, and do one redo after it is Marked.
- Practise every tool in the App Tutorial, where nothing is saved.

**Teachers**

- Create Classes and Tasks, and choose which tools students can use.
- Upload a Reference Map and preview it on an iPhone, an iPad or a computer. They can stretch it, keep its shape, or crop it separately for each device.
- See every Group's latest map for a Task in the Gallery, updating as students draw.
- Review handed-in maps with written feedback and red-pen ink.
- Send App Feedback to the people who build the app.

The words used here have exact meanings, defined in the [Glossary](GLOSSARY.md).

## Run it locally

There is no build step or dependency to install. From the top folder of the repo, start any static file server:

```sh
python -m http.server 8000
```

Then open <http://127.0.0.1:8000/>.

> [!WARNING]
> A local copy connects to the **real Supabase project**, so anything you save changes real data. Use a throwaway Task or a Guest account, and never test on a real Class.

## Run the tests

The tests need only [Node.js](https://nodejs.org), and have been run on version 22:

```sh
node --test
```

They cover the logic in `js/project-access.js` and `js/reference-fit.js`. The rest of the app has no automated tests yet, so check changes in a browser.

## How the code is arranged

```text
kampungpals/
├── index.html              # the app's single page
├── privacy.html            # privacy policy
├── css/
│   └── style.css
├── js/                     # loaded in this order by index.html
│   ├── project-access.js   # what a device may do with a Project
│   ├── reference-fit.js    # how a Reference Map fills the map area
│   ├── app.js              # the main app
│   ├── map-tools.js        # extra drawing tools and Review comments
│   ├── revised-map.js      # task folders and redoing a Marked map
│   └── tutorial.js         # the App Tutorial
├── assets/                 # logo and images
├── tests/                  # run with node --test
├── tools/                  # App Feedback email script (Google Apps Script)
├── docs/
│   ├── adr/                # decisions and why they were made
│   └── specs/              # what each feature was meant to do
└── GLOSSARY.md             # what the app's words mean
```

`map-tools.js`, `revised-map.js` and `tutorial.js` change some functions from `app.js` as they load, so the order in `index.html` matters.

## Publishing

Every push to `main` goes live straight away:

- **[kampungpals.app](https://kampungpals.app)** is built by Cloudflare Pages, which publishes the top folder of the repo. Moving `index.html` needs a matching change to the Cloudflare settings, or the site goes down.
- A second copy is published to [GitHub Pages](https://amoskhan.github.io/kampungpals/).

When you change the CSS or a script, also change the `?v=` number on its link in `index.html`. Otherwise, a browser can mix old and new files and break the layout.

## Backend

Sign-in, data and image storage use [Supabase](https://supabase.com). **The database setup is not in this repo**, so a fresh copy of this code cannot create its own backend. App Feedback emails come from a separate Google Apps Script, set up using [this guide](docs/app-feedback-email-setup.md).

## Documentation

- [Glossary](GLOSSARY.md)
- [Architecture decisions](docs/adr/)
- [Feature specs](docs/specs/)
- [Privacy policy](privacy.html)

## Credits

Kampung Pals is a prototype created by **Muhammad Akid Durrani Bin Imran** and **Khan Jun Ming, Amos**.

## Licence

No licence has been chosen yet, so the authors keep all rights to this code.
