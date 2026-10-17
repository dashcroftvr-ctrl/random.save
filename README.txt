GAZ & SERG — interactive characters for Quest 3S
================================================

WHAT'S IN THIS FOLDER
  index.html   the page
  app.js       all the behaviour
  models/      gaz.glb and serg.glb
  vendor/      the 3D engine (three.js) - no internet CDN needed

IMPORTANT: it must be opened from an https:// link.
Opening index.html straight from the headset's Files app will NOT
let you enter passthrough/VR. It also won't run from a plain file on
a PC (browsers block loading the models that way).

OPTION A - your Raspberry Pi web server
  1. Copy this whole folder (keep the folder structure) into the web
     root of one of your sites that already has HTTPS, e.g.
        /var/www/<your-site>/xr/
  2. On the Quest 3S, open the Browser and go to
        https://<your-site>/xr/
  3. Press "Passthrough - in your room".
  Nothing to configure: it's plain static files. (If you use nginx's
  default mime.types, .js and .glb are already handled.)

OPTION B - GitHub Pages (free)
  1. Create a public repo, upload everything in this folder.
  2. Settings > Pages > Deploy from branch > main / root.
  3. Open https://<username>.github.io/<repo>/ on the Quest.

IN THE HEADSET
  Walk up to them    they turn, look at you and say hello
  Get too close      they step back ("Personal space!")
  Poke               fingertip (or controller tip) on chest or head
                     4 pokes in quick succession and they lose patience
  High-five          hold your hand up near head height in front of one
                     of them, wait for his hand to come up, then slap it.
                     Leave him waiting and he'll call you out.
  Ignore them        after ~20s they get bored (Serg may nod off - walk
                     over to wake him)
  Stare at one       he'll ask what you're looking at
  Floating panel     low on your left. Press with a finger, or point a
                     controller/pinch: Dance-off, Gaz's gag, Bring here
                     (puts them in front of you again), Sound on/off
  Dance-off          ends with a vote - poke the winner
  Point + trigger    (or pinch) at a character pokes him from a distance

ON A PC (preview)
  Click to poke, drag to look around, scroll or W/S to walk in,
  hold H to hold a hand up for a high-five.
