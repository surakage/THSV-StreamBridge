// Critter Catch: wild Village Critters wander onto the stream overlay now and then. Keepers (viewers) throw a Jar
// with !catch, a channel point reward or a chosen gift, spending Viewer Foundation points. Each throw is rolled fairly;
// everyone whose throw lands catches the critter for their own Field Journal (or only the first, if the creator
// prefers). A missed throw can scare the critter off. Monthly catches reset on the 1st in the creator's time zone with
// a hall of fame; Field Journals never reset. No Streamer.bot import is needed.
import { randomInt } from 'node:crypto';

const MODULE_ID = 'thsv.critter-catch';
const PLATFORMS = Object.freeze(['twitch', 'youtube', 'kick', 'tiktok', 'facebook']);
const PLATFORM_LABELS = Object.freeze({ twitch: 'Twitch', youtube: 'YouTube', kick: 'Kick', tiktok: 'TikTok', facebook: 'Facebook' });
const LIMITS = Object.freeze({ twitch: 500, youtube: 200, kick: 500, tiktok: 150, facebook: 500 });
const POSITIONS = Object.freeze(['top-left', 'top-center', 'top-right', 'center-left', 'center-right', 'bottom-left', 'bottom-center', 'bottom-right']);
const RARITIES = Object.freeze(['common', 'uncommon', 'rare', 'guardian']);
const RARITY_LABELS = Object.freeze(['Common', 'Uncommon', 'Rare', 'Guardian']);
const JARS = Object.freeze(['jar', 'honey', 'moon']);
const JAR_LABELS = Object.freeze(['Jar', 'Honey Jar', 'Moon Jar']);
const JAR_BONUS = Object.freeze({ jar: 1, honey: 1.5, moon: 2.5 });
const MAX_KEEPERS = 2_000;
const MAX_CUSTOM_CRITTERS = 300;
const MAX_THROWS_SHOWN = 12;
const HALL_OF_FAME_MONTHS = 12;
const CHAT_QUIET_MS = 10 * 60_000;

// ---------- Village Critters (Generation 1) ----------
// [number, name, rarity, type, stage, Field Journal entry]. Stage decides the base catch rate.
export const VILLAGE = Object.freeze([
  [1, "Moplet", "uncommon", "Moss", "Sprout", "Moplet spends most of the day hanging from a branch, fast asleep. Moss grows in its fur, and small birds sometimes nest there without waking it."],
  [2, "Mosslow", "rare", "Moss", "Bloomed", "Mosslow wears a thick poncho of moss, and ferns sprout from the top of its head. After it rains, it wrings the poncho out over thirsty seedlings."],
  [3, "Grandbough", "rare", "Moss", "Elder", "Grandbough is so old that a tree has grown on its back. It carries a lantern at night, and villages are often built where it chooses to rest."],
  [4, "Cinderpup", "uncommon", "Ember", "Sprout", "Cinderpup's ears and tail glow like warm coals. When it gets excited, it sneezes sparks, so keep it away from haystacks."],
  [5, "Bellowhound", "rare", "Ember", "Bloomed", "The bellows on Bellowhound's chest fan the flames around its neck. One bark from it can warm a cold room in seconds."],
  [6, "Forgemaw", "rare", "Ember", "Elder", "Forgemaw's head is as hard as an anvil, and a furnace burns in its chest. Smiths leave scrap metal out at night, and by morning Forgemaw has shaped it into tools."],
  [7, "Puddlepip", "uncommon", "Brook", "Sprout", "Puddlepip hatches in the first puddle after a spring storm. It hums one soft note, and the puddle ripples in time."],
  [8, "Rillnewt", "rare", "Brook", "Bloomed", "As Rillnewt grows, its body stretches long and its fins get strong enough for fast water. Every spring, it swims upstream to the quiet pools where it hatched."],
  [9, "Cascadrake", "rare", "Brook", "Elder", "Cascadrake's body flows like a river, and a mane of mist trails behind its head. When a river changes course overnight, people say a Cascadrake passed through."],
  [10, "Seedlet", "common", "Moss", "Sprout", "Seedlet buries itself in soft soil to nap. Each time it wakes up, it is a little taller."],
  [11, "Saplimb", "uncommon", "Moss", "Bloomed", "Saplimb freezes whenever someone looks at it. Travellers often mistake it for a young tree."],
  [12, "Oakenhart", "rare", "Moss", "Elder", "Oakenhart carries a small oak crown on each antler, with acorns hanging from the branches. Squirrels follow it all autumn, catching every acorn that falls."],
  [13, "Mushmop", "common", "Moss", "Sprout", "Mushmop waddles about on short legs under a spotted red cap. When it gets wet, it shakes the cap like a dog, and spores fly everywhere."],
  [14, "Capstool", "uncommon", "Moss", "Bloomed", "Capstool's broad cap is the perfect height for a stool, and it lets tired travellers sit on it for a rest. If they stay too long, it waddles off with them still on top."],
  [15, "Myceliath", "rare", "Moss", "Elder", "Myceliath is linked to every mushroom in the forest by glowing threads. It uses them to pass messages from one side of the woods to the other."],
  [16, "Lichenail", "common", "Moss", "Sprout", "Lichenail leaves a trail of tiny clovers instead of slime. Follow the clovers and you will find it."],
  [17, "Terrashell", "uncommon", "Moss", "Bloomed", "Terrashell's shell is a glass jar with a tiny garden of sprouts and flowers inside. On sunny days, it basks for hours so the garden can grow."],
  [18, "Greenhaven", "rare", "Moss", "Elder", "Greenhaven carries a whole greenhouse on its back. Lost butterflies shelter inside it during storms."],
  [19, "Bramblet", "common", "Moss", "Sprout", "Bramblet hides in hedges and darts out to steal berries. Its thorny tail makes it hard to catch."],
  [20, "Thornferret", "uncommon", "Moss", "Bloomed", "Thornferret grows berries along its bramble-covered back. It only shares them with critters it trusts."],
  [21, "Hedgewyrm", "rare", "Moss", "Elder", "Hedgewyrm is a long dragon made of trimmed bushes and roses. Gardeners shape their hedges to look like it, hoping one will move in."],
  [22, "Budling", "common", "Bloom", "Sprout", "Budling hides inside a closed flower bud. It opens one petal a day as it learns to feel safe."],
  [23, "Petalskirt", "uncommon", "Bloom", "Bloomed", "Petalskirt loves to dance, and its petal skirt spins open as it twirls. Little sparkles drift around it whenever it is having fun."],
  [24, "Florabelle", "rare", "Bloom", "Elder", "Florabelle glides across still ponds with its petal wings folded over its back. When it spreads them, the whole pond fills with a sweet, calming scent."],
  [25, "Pollipuff", "common", "Bloom", "Sprout", "Pollipuff is a fuzzy ball of pollen with tiny wings. If you sneeze near one, it sneezes right back."],
  [26, "Hummbud", "uncommon", "Bloom", "Bloomed", "Hummbud carries a little basket of flowers wherever it goes. It gives them to any critter that looks sad."],
  [27, "Hiveheart", "rare", "Bloom", "Elder", "Hiveheart wears a honeycomb crown and rules a hive that hums a single song. Every flower in the valley sways to it."],
  [28, "Dandelet", "common", "Bloom", "Sprout", "Dandelet has a dandelion puff for a tail. A wish made on one of its seeds comes true, just a little."],
  [29, "Puffpaw", "uncommon", "Bloom", "Bloomed", "Puffpaw has dandelion tufts on its ears and the tip of its tail. When it runs, seeds stream off behind it, and the tufts grow back by the next morning."],
  [30, "Galefluff", "rare", "Bloom / Spirit", "Elder", "Galefluff floats across the sky trailing a long cloud of seed fluff. Seeing one means a mild spring is on the way."],
  [31, "Inchrose", "common", "Bloom", "Sprout", "Inchrose has a rosebud for a head. It measures everything it meets, one inch at a time."],
  [32, "Cocoonrose", "uncommon", "Bloom", "Bloomed", "Cocoonrose wraps itself in rose petals and hangs from a stem while it changes. It smells wonderful the whole time."],
  [33, "Monarose", "rare", "Bloom", "Elder", "Monarose's wings are shaped like rose petals, each marked with a swirl like an opening bud. When it spreads them in the sun, the swirls look like big eyes and scare off hungry birds."],
  [34, "Wickling", "common", "Ember", "Sprout", "Wickling is a little candle with a flame for a tuft of hair. It ducks behind trees whenever the wind picks up, because one strong gust could blow it out."],
  [35, "Lanternkin", "uncommon", "Ember", "Bloomed", "Lanternkin lives inside a glass lantern that shields its flame. It lights the way home for anyone lost after dark."],
  [36, "Chandelord", "rare", "Ember", "Elder", "Chandelord floats like a chandelier covered in flames and crystal drops. Its light grows brighter whenever people laugh."],
  [37, "Glowgrub", "common", "Ember", "Sprout", "Glowgrub curls up in warm ash and glows softly. A wood stove with a Glowgrub inside never goes cold."],
  [38, "Ashcoon", "uncommon", "Ember", "Bloomed", "Ashcoon is a charred cocoon that crackles and glows through its cracks. The warmer it gets, the closer it is to changing."],
  [39, "Embermoth", "rare", "Ember", "Elder", "Embermoth's wide wings are edged with little flames that shed sparks, but the sparks never burn. Keepers say catching one keeps you warm all night."],
  [40, "Chilipip", "common", "Ember", "Sprout", "Chilipip is a tiny lizard shaped like a chili pepper, with a green stem on its head. It is far too spicy to hold for long."],
  [41, "Salsalamander", "uncommon", "Ember", "Bloomed", "Salsalamander has pepper-shaped ridges down its back. Its footprints leave tiny scorch marks wherever it walks."],
  [42, "Scovillisk", "rare", "Ember", "Elder", "Scovillisk wears a crown of flames on its head and puffs smoke from its nose when it is cross. Village cooks keep one nearby, because a single breath can roast a whole basket of peppers."],
  [43, "Crumbun", "common", "Ember", "Sprout", "Crumbun is a round bunny shaped like a bread roll, and it steams gently when it is happy. Any spot where it naps smells like fresh baking for hours."],
  [44, "Loafhare", "uncommon", "Ember", "Bloomed", "Loafhare has a golden crust for a coat. The crust gets crispier whenever it feels proud of itself."],
  [45, "Hearthare", "rare", "Ember", "Elder", "Hearthare has an oven in its belly and a chimney on its back. On cold nights, families gather around one to share warm bread."],
  [46, "Claypip", "common", "Stone", "Sprout", "Claypip is a little clay pot covered in fingerprints. If you squeeze it gently, it changes shape a little."],
  [47, "Kilnling", "uncommon", "Stone", "Bloomed", "Kilnling has been fired in a kiln and painted in bright patterns. It is so proud of its paint that it refuses to get muddy."],
  [48, "Terracolossus", "rare", "Stone", "Elder", "Terracolossus is a tall clay statue with cracks that glow. It stands guard at village gates, and nobody knows who made the first one."],
  [49, "Burrbit", "common", "Stone", "Sprout", "Burrbit picks the sturdiest acorn cap it can find and wears it for life. It never takes the cap off, not even to sleep."],
  [50, "Burrguard", "uncommon", "Stone", "Bloomed", "Burrguard's quills have hardened into stone spikes, and its acorn cap is now a helmet. When it is scared, it rolls into a ball as hard as a rock."],
  [51, "Boulderhog", "rare", "Stone", "Elder", "Boulderhog's quills have grown into a hill of mossy boulders, and its old acorn cap still sits on top. When it curls up, the boulders lock together so tightly that not even a flood can move it."],
  [52, "Pebblit", "common", "Stone", "Sprout", "Pebblit is a living pebble with mossy eyebrows. It loves being skipped across ponds."],
  [53, "Cairnling", "uncommon", "Stone", "Bloomed", "Cairnling is a walking stack of balanced stones held together by moss. If it topples over, it patiently stacks itself back up, smallest stone on top."],
  [54, "Standstone", "rare", "Stone / Spirit", "Elder", "Standstone is an ancient standing stone carved with glowing runes, with two small stones that float beside it. It hums at sunrise, and its runes light up whenever someone nearby tells the truth."],
  [55, "Geodig", "common", "Stone", "Sprout", "Geodig is a mole with a cracked geode for a nose. It can smell crystals buried deep underground and digs straight down to them."],
  [56, "Amethole", "uncommon", "Stone", "Bloomed", "Amethole is studded with purple crystals. Every evening, it polishes them carefully with its paws."],
  [57, "Cavernking", "rare", "Stone", "Elder", "Cavernking carries a whole crystal cave on its back, and the crystals glow brighter the deeper it digs. Miners who spot that glow underground know they are close to something precious."],
  [58, "Cobbletort", "common", "Stone", "Sprout", "Cobbletort's shell is made of cobblestones, and it loves to nap in the middle of paths. Travellers in the village have learned to watch their step."],
  [59, "Bridgetort", "uncommon", "Stone", "Bloomed", "Bridgetort's shell has grown into a small stone arch. Critters cross streams by walking over its back."],
  [60, "Castletort", "rare", "Stone", "Elder", "Castletort carries a little fortress with flags on its shell. A whole village of critters lives in its towers."],
  [61, "Bubblit", "common", "Brook", "Sprout", "Bubblit is a tiny fish that floats through the air inside a bubble. If it giggles too hard, the bubble pops."],
  [62, "Bubblefin", "uncommon", "Brook", "Bloomed", "Bubblefin wears its bubble like a helmet and walks on its fins. It can explore dry land as long as the helmet stays full of water."],
  [63, "Cloudbreach", "rare", "Brook", "Elder", "Cloudbreach is a sky whale that swims through the clouds and leaves a trail of gentle rain. Farmers cheer when one passes over a dry field."],
  [64, "Pebblotter", "common", "Brook", "Sprout", "Pebblotter is an otter pup that hugs its favourite pebble. It will not fall asleep without it."],
  [65, "Raftotter", "uncommon", "Brook", "Bloomed", "Raftotter floats on its back carrying a raft of reeds. It gives tired critters rides down the river."],
  [66, "Weirwarden", "rare", "Brook / Stone", "Elder", "Weirwarden is a great otter that builds stone dams with its paddle tail. Its dams make the quiet pools where Puddlepips hatch."],
  [67, "Dewclaw", "common", "Brook", "Sprout", "Dewclaw is a tiny hermit crab that carries an acorn cup full of dew instead of a shell. On hot days, it tips the cup and drinks from it."],
  [68, "Shellskip", "uncommon", "Brook", "Bloomed", "Shellskip uses a chipped teacup for a shell. It will swap it for anyone who offers a nicer cup."],
  [69, "Beaconclaw", "rare", "Brook", "Elder", "Beaconclaw's shell is a working lighthouse that it carries along the coast. Fishing boats wave to it as they pass, and it waves back with both claws."],
  [70, "Drizzlet", "common", "Brook", "Sprout", "Drizzlet is a tiny lamb made of raincloud fluff, standing on stubby legs. It drizzles a little when it is sad and makes a small rainbow when it cheers up."],
  [71, "Stormpuff", "uncommon", "Brook / Night", "Bloomed", "Stormpuff is a sheep whose wool is a grey thundercloud. If you shear one, it rains for a week."],
  [72, "Tempestram", "rare", "Brook / Night", "Elder", "Tempestram has storm-cloud wool and curled horns striped with lightning. When it headbutts, it sounds like thunder rolling over the hills."],
  [73, "Glowpole", "common", "Night", "Sprout", "Glowpole is a tadpole with a glowing dot on its forehead. Groups of them gather in ponds to make floating star maps."],
  [74, "Lumipad", "uncommon", "Night", "Bloomed", "Lumipad sits on lily pads with its throat glowing like a lantern. At dusk, it blinks its light to call the other frogs to come and sing."],
  [75, "Lanterntoad", "rare", "Night", "Elder", "Lanterntoad's throat glows like a big paper lantern, and fireflies circle its head like a crown. On summer nights, the fireflies blink in time with its croaks."],
  [76, "Hootlet", "common", "Night", "Sprout", "Hootlet is a fluffy owlet with half-moon brows. It stays up past its bedtime every single night."],
  [77, "Moonhoot", "uncommon", "Night", "Bloomed", "Moonhoot wears a crescent-moon mask on its face. Its hoot changes pitch with each phase of the moon."],
  [78, "Eclipsowl", "rare", "Night", "Elder", "Eclipsowl's wings show the night sky, with stars in the feathers. When it spreads its wings, day briefly turns to dusk."],
  [79, "Dozebat", "common", "Night", "Sprout", "Dozebat sleeps on a branch with its wings wrapped around it like a blanket. It snores in tiny squeaks."],
  [80, "Lullaflap", "uncommon", "Night", "Bloomed", "Lullaflap has bell-shaped ears that ring softly when it sings. Its lullabies put even the most restless critters to sleep."],
  [81, "Dreamwing", "rare", "Night / Spirit", "Elder", "Dreamwing is a giant bat whose wings shimmer like an aurora. Anyone who sees one remembers their dreams the next morning."],
  [82, "Sneakit", "common", "Night", "Sprout", "Sneakit is a masked raccoon kit that clutches a shiny button. It collects anything that sparkles."],
  [83, "Pilfurr", "uncommon", "Night", "Bloomed", "Pilfurr carries a sack full of trinkets. It always leaves something behind in exchange for what it takes."],
  [84, "Trinketking", "rare", "Night", "Elder", "Trinketking wears a crown of bent spoons and a cape made from an old curtain. Every full moon, it lays out its whole collection and counts it twice."],
  [85, "Dusklet", "common", "Night", "Sprout", "Dusklet's fur fades from orange to purple like a sunset. It only comes out to play at dusk."],
  [86, "Gloamcat", "uncommon", "Night", "Bloomed", "Gloamcat fades into the shadows when it stands still. At night, it walks beside travellers to keep them company."],
  [87, "Nocturnyx", "rare", "Night / Spirit", "Elder", "Nocturnyx is a panther whose fur shows a field of stars, with a crescent moon on its brow. Some say the night sky is its old coat."],
  [88, "Sheetling", "common", "Spirit", "Sprout", "Sheetling is a little ghost under a sheet with a bow on top. It says boo and then immediately apologises."],
  [89, "Quiltghost", "uncommon", "Spirit", "Bloomed", "Quiltghost wears a patchwork quilt. Each patch is a memory from a house it once lived in."],
  [90, "Hearthaunt", "rare", "Spirit", "Elder", "Hearthaunt is a friendly old ghost draped in curtains, with keys that jangle as it moves. It keeps old houses warm and tidy for whoever lives there next."],
  [91, "Echick", "common", "Spirit", "Sprout", "Echick is a chick that can only repeat sounds it hears. It says the last word you spoke, in your own voice."],
  [92, "Chorusparrow", "uncommon", "Spirit", "Bloomed", "Chorusparrow is three sparrows sharing one round body. They sing in harmony and never sing the same song twice."],
  [93, "Harmonicrane", "rare", "Spirit", "Elder", "Harmonicrane's long neck is shaped like an organ pipe. Its call carries across three valleys."],
  [94, "Masquelet", "common", "Spirit", "Sprout", "Masquelet is a shy little spirit that hides behind a carved wooden mask. When it feels safe, it tilts the mask up just enough to peek out."],
  [95, "Totemask", "uncommon", "Spirit", "Bloomed", "Totemask is a stack of three masks, each with a different mood. It turns whichever mask matches how it feels to the front."],
  [96, "Ancestree", "rare", "Spirit / Moss", "Elder", "Ancestree is an ancient spirit that has put down roots like a tree, with masks hanging from its branches. Each mask holds the advice of a Keeper from long ago."],
  [97, "Origamouse", "common", "Spirit", "Sprout", "Origamouse is a paper mouse folded from a letter. When nobody is looking, it unfolds itself to read the letter."],
  [98, "Origaminx", "uncommon", "Spirit", "Bloomed", "Origaminx is a paper lynx with sharp folded ears. If it gets creased, it carefully refolds itself."],
  [99, "Foldrake", "rare", "Spirit", "Elder", "Foldrake is a paper dragon made from a thousand folded pages. Its wings rustle like turning pages when it flies."],
  [100, "Kettlekit", "common", "Ember", "Sprout", "Kettlekit curls up inside a copper kettle. It whistles when it is happy."],
  [101, "Steamtabby", "uncommon", "Ember", "Bloomed", "Steamtabby has a kettle-spout tail that puffs out steam. It sits on chilly laps on purpose to warm them up."],
  [102, "Cloverbit", "common", "Bloom", "Sprout", "Cloverbit has a four-leaf clover growing from its head. Finding one is said to bring a week of good luck."],
  [103, "Fortunouse", "uncommon", "Bloom", "Bloomed", "Fortunouse wears a coat of clovers and a horseshoe charm. In old stories, lucky travellers always had one in their pocket."],
  [104, "Fernbeetle", "common", "Moss", "Sprout", "Fernbeetle has a curled fern frond on its head. It unrolls the fern when it feels brave."],
  [105, "Frondrhino", "uncommon", "Moss", "Bloomed", "Frondrhino is a rhino beetle with a huge fern crest. It charges at weeds that crowd its favourite plants."],
  [106, "Pinecub", "common", "Moss", "Sprout", "Pinecub is a bear cub that sleeps tucked inside a pinecone. When it wants to get somewhere fast, it rolls downhill."],
  [107, "Conifurr", "uncommon", "Moss", "Bloomed", "Conifurr wears armour of pinecone scales and smells of pine. It sleeps under the snow all winter and wakes with a fresh coat of needles."],
  [108, "Tulipuff", "common", "Bloom", "Sprout", "Tulipuff sits inside a tulip cup. At night, the tulip closes around it like a little bed."],
  [109, "Tuliploft", "uncommon", "Bloom", "Bloomed", "Tuliploft has grown big enough to hold its tulip upside down like a parachute. It drifts from garden to garden on the spring breeze and lands softly on open flowers."],
  [110, "Jamling", "common", "Bloom", "Sprout", "Jamling is a wobbly blob of berry jam that lives in a jar. It is very sticky and very sweet."],
  [111, "Jamboree", "uncommon", "Bloom", "Bloomed", "Jamboree has outgrown its jar and now wobbles about in a big clay crock. Whole berries bob inside it, and it loves to drip a spoonful onto fresh toast."],
  [112, "Sparket", "common", "Ember", "Sprout", "Sparket is a cricket that chirps tiny sparks. Its song sometimes lights candles by accident."],
  [113, "Bonfiricket", "uncommon", "Ember", "Bloomed", "Bonfiricket's wings blaze like a crackling campfire that never burns out. Its chirp pops and snaps like burning logs, so it can be heard from across the valley."],
  [114, "Brickling", "common", "Ember / Stone", "Sprout", "Brickling is a short row of warm bricks that wiggles like a caterpillar. It likes to sleep in chimneys."],
  [115, "Chimnipede", "uncommon", "Ember / Stone", "Bloomed", "Chimnipede is a long centipede made of bricks, with a smoking chimney for a head. Each segment is a little warmer than the one before."],
  [116, "Frostlet", "common", "Brook", "Sprout", "Frostlet is a seal pup that looks like a snowball. It slides everywhere instead of walking."],
  [117, "Glaciseal", "uncommon", "Brook", "Bloomed", "Glaciseal carries an iceberg on its back. It sings to the iceberg to keep it from melting."],
  [118, "Kelpup", "common", "Brook", "Sprout", "Kelpup is a puppy made of tangled seaweed. It always shakes off salt water at the worst possible moment."],
  [119, "Kelphound", "uncommon", "Brook", "Bloomed", "Kelphound is a tall hound with a flowing seaweed mane. It keeps watch over the tide pools and barks to warn the crabs when the water comes rushing back."],
  [120, "Mistling", "common", "Brook", "Sprout", "Mistling is a bunny made of morning fog. It fades away when the sun gets warm."],
  [121, "Foghare", "uncommon", "Brook / Spirit", "Bloomed", "Foghare trails fog from its feet as it runs. When it races through a meadow, the whole meadow disappears from view."],
  [122, "Gemko", "common", "Stone", "Sprout", "Gemko is a gecko with a gem on the tip of its tail. If it drops its tail to escape, the new one grows back in a different colour."],
  [123, "Prismander", "uncommon", "Stone", "Bloomed", "Prismander has crystals growing along its back that split sunlight into rainbows. It spends sunny afternoons on flat rocks, filling its crystals with colour."],
  [124, "Cragkid", "common", "Stone", "Sprout", "Cragkid is a goat kid with pebble hooves. It climbs anything, including Keepers."],
  [125, "Summitgoat", "uncommon", "Stone", "Bloomed", "Summitgoat has slate horns and a beard that flutters like a flag. It stands on the highest peak to greet the sunrise."],
  [126, "Starmite", "common", "Night", "Sprout", "Starmite is a tiny fallen star with fuzz and little feet. It glows brighter whenever someone makes a wish."],
  [127, "Wishburst", "uncommon", "Night", "Bloomed", "Wishburst has grown into a bright star with a long comet tail. Every wish it hears becomes a new sparkle in that tail."],
  [128, "Inkspin", "common", "Night", "Sprout", "Inkspin is a spider that spins webs out of ink. It writes the first letter of your name in its web."],
  [129, "Scriptula", "uncommon", "Night", "Bloomed", "Scriptula spins webs that look like pages of handwritten poems. No two of its poems are ever the same."],
  [130, "Chimeling", "common", "Spirit", "Sprout", "Chimeling is a little bird with wind chimes for tail feathers. They ring softly when a friend is close."],
  [131, "Chimecaller", "uncommon", "Spirit", "Bloomed", "Chimecaller has a long cascade of chime feathers. When it sings at dusk, every chime rings a different note, and the whole village stops to listen."],
  [132, "Tickcub", "common", "Spirit", "Sprout", "Tickcub is a bear cub with an hourglass in its belly. It naps for exactly one hour at a time."],
  [133, "Hourbear", "rare", "Spirit", "Bloomed", "Hourbear has a glowing hourglass belly and claws shaped like clock hands. Some say it can make a lovely afternoon last longer."],
  [134, "Stumpling", "common", "Moss", "Sprout", "Stumpling is a tree stump with mushroom ears. It sits still for years, then one day simply walks away."],
  [135, "Hollowlog", "uncommon", "Moss", "Bloomed", "Hollowlog is a walking hollow log with small critters living inside. It carries its tenants to better neighbourhoods."],
  [136, "Letterwing", "uncommon", "Spirit", "Never grows", "Letterwing is a pigeon with a tiny satchel of letters. It delivers letters that were written but never sent."],
  [137, "Umbrellama", "uncommon", "Brook", "Never grows", "Umbrellama has a mane shaped like an open umbrella. It stays dry in any storm and lets others shelter underneath."],
  [138, "Napapotamus", "common", "Brook", "Never grows", "Napapotamus is a tiny hippo that floats on its back, always fast asleep. It snores little bubbles that drift across the pond."],
  [139, "Wayfinch", "uncommon", "Night", "Never grows", "Wayfinch's beak works like a compass needle. No matter where it flies, its beak points towards home."],
  [140, "Thimbleshrew", "common", "Bloom", "Never grows", "Thimbleshrew wears a thimble as a helmet and carries a needle. It sews fallen leaves into little blankets."],
  [141, "Grumbleweed", "common", "Moss", "Never grows", "Grumbleweed is a tumbleweed with a grumpy face. It complains the whole time it rolls, but it never stops rolling."],
  [142, "Pumpkit", "uncommon", "Bloom / Night", "Never grows", "Pumpkit is a kitten that lives inside a carved pumpkin with a glowing smile. It turns up in pumpkin patches every autumn."],
  [143, "Anvilope", "rare", "Stone", "Never grows", "Anvilope is an antelope with heavy, anvil-shaped horns. Smiths say that striking metal on its horns makes the strongest steel."],
  [144, "Yarnling", "common", "Bloom", "Never grows", "Yarnling is a ball of yarn shaped like a kitten, with a loose thread for a tail. When it gets excited, it unravels and has to be wound back up."],
  [145, "Steamacaque", "uncommon", "Brook / Ember", "Never grows", "Steamacaque sits in a little hot spring with a towel on its head. It shares its spring with anyone who is cold."],
  [146, "Keykit", "rare", "Spirit", "Never grows", "Keykit is a kitten with a key for a tail. It can open any door, but it only lets in friends."],
  [147, "Auroray", "rare", "Night / Brook", "Never grows", "Auroray is a manta ray that glides through the sky on wings like the northern lights. It only appears on the clearest, coldest nights."],
  [148, "Sylvaroot", "guardian", "Moss / Stone", "Guardian", "Sylvaroot is a giant serpent of roots and moss that holds the forest floor together. When it stirs, fresh springs bubble up from the ground."],
  [149, "Pyrelark", "guardian", "Ember / Bloom", "Guardian", "Pyrelark sings the sun up every morning and scatters warm petals as it flies. On the days it sleeps in, the dawn comes late."],
  [150, "Lunatide", "guardian", "Brook / Night", "Guardian", "Lunatide floats high above the sea and pulls the tide in and out with its silver threads. It does this work at night while the village sleeps."],
  [151, "Wispurr", "guardian", "Spirit", "Guardian", "Wispurr is a fox spirit whose flame tail never goes out. It only appears in villages where people are kind to one another."],
]);
const KNACKS = Object.freeze({ 120: -5, 138: 10, 141: -5 });
const BASE_RATES = Object.freeze({ 'common|Sprout': 55, 'common|Never grows': 50, 'uncommon|Sprout': 35, 'uncommon|Bloomed': 35, 'uncommon|Never grows': 30, 'rare|Bloomed': 18, 'rare|Elder': 15, 'rare|Never grows': 12, 'guardian|Guardian': 4 });
const CUSTOM_RATES = Object.freeze({ common: 50, uncommon: 30, rare: 12, guardian: 4 });

// ---------- Village Games kit ----------
export function clean(value, maximum = 160) {
  return [...(typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() : '')].slice(0, maximum).join('');
}
function integer(value, minimum, maximum, fallback) { const number = Number(value); return Number.isInteger(number) && number >= minimum && number <= maximum ? number : fallback; }
function choice(value, choices, fallback) { return choices.includes(value) ? value : fallback; }
function https(value) { return typeof value === 'string' && /^https:\/\/[^\s"'<>]+$/u.test(value) && value.length <= 2_000 ? value : ''; }

export function resolveTimeZone(value) {
  const zone = clean(value, 100);
  if (zone) { try { new Intl.DateTimeFormat('en-US', { timeZone: zone }).format(); return zone; } catch { /* fall through */ } }
  try { return new Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
}
export function seasonKey(timeZone, now = Date.now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(new Date(now)).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}`;
}
/** One stable key per person: their Viewer Foundation ID (linked accounts share one Field Journal), else platform + user. */
export function playerKey(event, viewerId = '') {
  if (/^[A-Za-z0-9_-]{8,128}$/u.test(viewerId)) return `vf:${viewerId}`;
  const id = clean(event?.user?.id, 128);
  const name = clean(event?.user?.name, 128).toLowerCase();
  return id || name ? `${event.platform}:${id ? `id:${id}` : `name:${name}`}` : '';
}
export function moderator(event) {
  const roles = Array.isArray(event?.user?.roles) ? event.user.roles.map((role) => String(role).toLowerCase()) : [];
  return roles.includes('broadcaster') || roles.includes('moderator') || roles.includes('mod');
}
function shorten(text, maximum) {
  const characters = [...text];
  return characters.length <= maximum ? text : `${characters.slice(0, Math.max(1, maximum - 1)).join('').trimEnd()}…`;
}
export function fill(template, values) {
  return clean(String(template ?? '').replace(/\{([a-z]+)\}/giu, (whole, key) => (Object.hasOwn(values, key) ? String(values[key]) : whole)), 1_000);
}
const REWARD_ID = /^[A-Za-z0-9][A-Za-z0-9-]{7,99}$/u;
/** Turns the Twitch Jar rewards on while a critter is on screen and off again when it is gone. */
const TWITCH_REWARD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
async function setRewards(context, settings, on, platform = '') {
  if (!settings.toggleRewards || !settings.platforms.includes('twitch') || typeof context?.streamerbot?.administerReward !== 'function') return;
  // Turning on only matters when the visit is on Twitch; turning off is always safe.
  if (on && platform && platform !== 'twitch') return;
  // Only Twitch reward IDs (UUIDs) can be switched; Kick IDs are matched but stay on.
  for (const reward of settings.rewardThrows.filter((item) => TWITCH_REWARD_ID.test(item.id))) {
    await context.streamerbot.administerReward({ platform: 'twitch', operation: on ? 'enable' : 'disable', rewardId: reward.id }).catch(() => undefined);
  }
}
async function refundRedemption(context, event) {
  const rewardId = clean(event?.payload?.rewardId, 256); const redemptionId = clean(event?.payload?.redemptionId, 256);
  if (event?.payload?.pointsReward === true) {
    // Bought with Viewer Foundation points: give the points back.
    const viewerId = clean(event.payload?.pointsViewerId, 64); const amount = Number(event.payload?.pointsCost);
    if (!viewerId || !Number.isSafeInteger(amount) || amount < 1 || !redemptionId || typeof context?.viewerFoundation?.mutate !== 'function') return;
    await context.viewerFoundation.mutate({ viewerId, operation: 'refund', amount, reason: 'Critter Catch: nothing to catch', idempotencyKey: `refund:${redemptionId}` }).catch(() => undefined);
    return;
  }
  if (event?.platform !== 'twitch' || !rewardId || !redemptionId || typeof context?.streamerbot?.administerReward !== 'function') return;
  await context.streamerbot.administerReward({ platform: 'twitch', operation: 'cancel', rewardId, redemptionId }).catch(() => undefined);
}

async function sayOn(context, platforms, message) {
  if (!message) return;
  for (const platform of platforms) {
    if (!PLATFORMS.includes(platform)) continue;
    await context.chat.send({ message: shorten(message, LIMITS[platform]), routing: 'selected', selectedPlatforms: [platform], overflow: 'reject' }).catch(() => undefined);
  }
}
async function viewerIdFor(context, event) {
  const userId = clean(event?.user?.id, 256);
  if (!userId || !PLATFORMS.includes(event?.platform)) return '';
  try { return (await context.viewerFoundation.getProjection({ platform: event.platform, userId }))?.viewerId ?? ''; } catch { return ''; }
}
/** A fair roll from 0 up to (not including) 1, using the operating system's secure random numbers. */
function roll(pick = randomInt) { return pick(1_000_000) / 1_000_000; }

// ---------- Critters ----------
function matchKey(value) { return clean(value, 100).toLowerCase().normalize('NFKC'); }

/** The base catch rate (percent) of a Village Critter, from its rarity and growth stage, plus its knack. */
export function villageRate(row) {
  const [number, , rarity, , stage] = row;
  return (BASE_RATES[`${rarity}|${stage}`] ?? CUSTOM_RATES[rarity] ?? 30) + (KNACKS[number] ?? 0);
}

/** A custom critter row: Name | Rarity | Type | Picture link (https) | Field Journal entry. */
export function parseCustomCritter(line) {
  const parts = (typeof line === 'string' ? line : '').split('|').map((part) => clean(part, 600));
  const name = clean(parts[0], 40);
  if (!name) return undefined;
  const rarityText = matchKey(parts[1]);
  const rarity = RARITIES.find((item) => item === rarityText) ?? (rarityText === 'legendary' ? 'guardian' : 'common');
  return { key: `c:${matchKey(name)}`, num: 0, name, rarity, type: clean(parts[2], 30), stage: '', picture: https(parts[3]), art: '', entry: clean(parts[4], 300), base: CUSTOM_RATES[rarity] };
}

/** Every critter that can wander in with the creator's settings. */
export function critterPool(settings) {
  const village = VILLAGE.map((row) => ({ key: `v:${String(row[0])}`, num: row[0], name: row[1], rarity: row[2], type: row[3], stage: row[4], entry: row[5], art: row[1].toLowerCase(), picture: '', base: villageRate(row) }));
  if (settings.critterSet === 'village') return village;
  const seen = new Set();
  const custom = settings.customCritters.filter((critter) => { if (seen.has(critter.key)) return false; seen.add(critter.key); return true; });
  if (settings.critterSet === 'custom') return custom.length > 0 ? custom : village;
  return [...village, ...custom];
}

/** The chance (percent) that one throw catches the critter: base x jar bonus, x0.8 for a Glimmer, capped. */
export function catchChance(critter, jar, glimmer, settings) {
  const cap = critter.rarity === 'guardian' ? settings.guardianCap : settings.cap;
  const value = critter.base * (JAR_BONUS[jar] ?? 1) * (glimmer ? 0.8 : 1);
  return Math.max(1, Math.min(cap, Math.round(value * 10) / 10));
}

export function settingsFor(context) {
  const raw = context?.settings ?? {};
  const platforms = (Array.isArray(raw.platforms) ? raw.platforms : PLATFORMS).filter((platform, index, all) => PLATFORMS.includes(platform) && all.indexOf(platform) === index);
  const list = (value, count, fallback, maximum) => Array.from({ length: count }, (_, index) => clean(Array.isArray(value) ? value[index] : '', maximum) || fallback[index]);
  const customCritters = (Array.isArray(raw.customCritters) ? raw.customCritters : []).map(parseCustomCritter).filter(Boolean).slice(0, MAX_CUSTOM_CRITTERS);
  const minMinutes = integer(raw.spawnMinMinutes, 1, 240, 6);
  const rewardThrows = (Array.isArray(raw.rewardThrows) ? raw.rewardThrows : []).map((line) => {
    const parts = (typeof line === 'string' ? line : '').split('|').map((part) => clean(part, 100));
    const name = matchKey(parts[0]);
    const jarText = matchKey(parts[1]);
    const jar = JARS.find((item) => item === jarText || matchKey(JAR_LABELS[JARS.indexOf(item)]) === jarText) ?? 'jar';
    // A Twitch reward ID (from the Bridge's reward list) can be turned on and off; a name only matches.
    const id = REWARD_ID.test(parts[0]) ? parts[0] : '';
    return name ? { name, jar, id } : undefined;
  }).filter(Boolean).slice(0, 30);
  return {
    enabled: raw.enabled === true, platforms,
    commandPlatforms: (Array.isArray(raw.commandPlatforms) ? raw.commandPlatforms : platforms).filter((platform) => platforms.includes(platform)),
    command: clean(raw.catchCommand, 40).replace(/^!+/u, '').toLowerCase() || 'catch',
    honeyWord: matchKey(raw.honeyWord) || 'honey', moonWord: matchKey(raw.moonWord) || 'moon',
    critterSet: choice(raw.critterSet, ['village', 'custom', 'both'], 'village'), customCritters,
    spawnMinMinutes: minMinutes, spawnMaxMinutes: Math.max(minMinutes, integer(raw.spawnMaxMinutes, 1, 240, 12)),
    onlyWhenChatting: raw.onlyWhenChatting !== false,
    visitMode: choice(raw.visitMode, ['active-platform', 'everyone'], 'active-platform'),
    activeChatters: integer(raw.activeChatters, 1, 100, 2),
    activeMinutes: integer(raw.activeMinutes, 1, 60, 10),
    weights: { common: integer(raw.commonWeight, 0, 1_000, 55), uncommon: integer(raw.uncommonWeight, 0, 1_000, 30), rare: integer(raw.rareWeight, 0, 1_000, 12), guardian: integer(raw.guardianWeight, 0, 1_000, 3) },
    guardianMonthlyLimit: integer(raw.guardianMonthlyLimit, 0, 100, 3),
    glimmerOdds: integer(raw.glimmerOdds, 0, 100_000, 200),
    seconds: { common: integer(raw.commonSeconds, 15, 900, 90), uncommon: integer(raw.uncommonSeconds, 15, 900, 75), rare: integer(raw.rareSeconds, 15, 900, 60), guardian: integer(raw.guardianSeconds, 15, 900, 120) },
    flee: { common: integer(raw.commonFlee, 0, 100, 5), uncommon: integer(raw.uncommonFlee, 0, 100, 10), rare: integer(raw.rareFlee, 0, 100, 15), guardian: integer(raw.guardianFlee, 0, 100, 20) },
    costs: { jar: integer(raw.jarCost, 0, 1_000_000, 50), honey: integer(raw.honeyCost, 0, 1_000_000, 150), moon: integer(raw.moonCost, 0, 1_000_000, 400) },
    cap: integer(raw.catchCap, 1, 100, 90), guardianCap: integer(raw.guardianCap, 1, 100, 25),
    catchMode: choice(raw.catchMode, ['everyone', 'first'], 'everyone'),
    throwCooldownSeconds: integer(raw.throwCooldownSeconds, 0, 120, 5),
    rewardThrows,
    toggleRewards: raw.toggleRewards !== false,
    announceSpawns: raw.announceSpawns !== false, announceMisses: raw.announceMisses === true, announceLeaves: raw.announceLeaves !== false,
    spawnMessage: clean(raw.spawnMessage, 300) || 'A wild {critter} ({rarity}) wandered in! Type !{command} to throw a Jar.',
    glimmerSpawnMessage: clean(raw.glimmerSpawnMessage, 300) || 'A shimmering Glimmer {critter} ({rarity}) wandered in! Type !{command} to throw a Jar.',
    rewardSpawnMessage: clean(raw.rewardSpawnMessage, 300) || 'A wild {critter} ({rarity}) wandered in! Redeem a Jar channel point reward to throw one.',
    rewardOnlyMessage: clean(raw.rewardOnlyMessage, 300) || '{name}, here you throw a Jar by redeeming a Jar channel point reward.',
    announceEntry: raw.announceEntry !== false,
    entryMessage: clean(raw.entryMessage, 400) || 'Field Journal #{number} {critter}: {entry}',
    caughtMessage: clean(raw.caughtMessage, 300) || '{name} caught {critter} with a {jar}! Field Journal: {count} of {total}.',
    glimmerCaughtMessage: clean(raw.glimmerCaughtMessage, 300) || '{name} caught a Glimmer {critter} with a {jar}! Field Journal: {count} of {total}.',
    missedMessage: clean(raw.missedMessage, 300) || '{critter} broke out of {name}\'s {jar}!',
    fledMessage: clean(raw.fledMessage, 300) || '{critter} broke out of {name}\'s {jar} and scurried off into the woods.',
    leftMessage: clean(raw.leftMessage, 300) || '{critter} wandered off. Watch for the next visitor!',
    noPointsMessage: clean(raw.noPointsMessage, 300) || '{name}, a {jar} costs {cost} {currency}. You have {points}.',
    noCritterMessage: clean(raw.noCritterMessage, 300) || 'No critter is wandering about right now. Watch the stream!',
    elsewhereMessage: clean(raw.elsewhereMessage, 300) || '{name}, {critter} is visiting {platformName} chat right now. The next one may wander in here!',
    alreadyMessage: clean(raw.alreadyMessage, 300) || '{name}, you already caught {critter} on this visit. Wait for the next critter!',
    cooldownMessage: clean(raw.cooldownMessage, 300) || '{name}, catch your breath. You can throw again in {seconds}s.',
    journalMessage: clean(raw.journalMessage, 300) || '{name}\'s Field Journal: {count} of {total} critters, {glimmers} Glimmer. {month} caught this month.',
    topMessage: clean(raw.topMessage, 300) || 'Top Keepers this month: {top}',
    noCatchesMessage: clean(raw.noCatchesMessage, 300) || 'Nobody has caught a critter yet this month.',
    infoMessage: clean(raw.infoMessage, 400) || '#{number} {critter} ({rarity} {type}): {entry}',
    notCaughtMessage: clean(raw.notCaughtMessage, 300) || '{name}, you have not caught {critter} yet.',
    hintText: clean(raw.hintText, 60) || 'Type !{command}',
    mixedHintText: clean(raw.mixedHintText, 60) || 'Type !{command} or redeem a Jar',
    wildLabel: clean(raw.wildLabel, 30) || 'A wild', glimmerLabel: clean(raw.glimmerLabel, 30) || 'Glimmer',
    caughtWord: clean(raw.caughtWord, 30) || 'Caught!', brokeFreeWord: clean(raw.brokeFreeWord, 30) || 'Broke free!', ranOffWord: clean(raw.ranOffWord, 30) || 'It ran off!',
    rarityNames: list(raw.rarityNames, 4, RARITY_LABELS, 20), jarNames: list(raw.jarNames, 3, JAR_LABELS, 20),
    position: choice(raw.position, POSITIONS, 'bottom-right'), size: choice(raw.critterSize, ['small', 'medium', 'large'], 'medium'),
    showKeepers: raw.showKeepers !== false,
    timeZone: resolveTimeZone(raw.timeZone),
  };
}

function rarityName(settings, rarity) { return settings.rarityNames[RARITIES.indexOf(rarity)] ?? rarity; }
function jarName(settings, jar) { return settings.jarNames[JARS.indexOf(jar)] ?? jar; }

// ---------- Field Journal masks ----------
// Village Critters caught are kept as one hexadecimal bit mask per Keeper (bit n = critter #n), so 2,000 Keepers fit.
export function hasCritter(mask, number) { try { return ((BigInt(`0x${mask || '0'}`) >> BigInt(number)) & 1n) === 1n; } catch { return false; } }
export function withCritter(mask, number) { try { return (BigInt(`0x${mask || '0'}`) | (1n << BigInt(number))).toString(16); } catch { return (1n << BigInt(number)).toString(16); } }
export function maskCount(mask) { let count = 0; for (const digit of String(mask || '')) { let value = Number.parseInt(digit, 16); while (value) { count += value & 1; value >>= 1; } } return count; }
function hexMask(value) { return typeof value === 'string' && /^[0-9a-f]{0,64}$/u.test(value) ? value : ''; }

// ---------- State ----------
function emptyState(now = Date.now(), timeZone = 'UTC') {
  return { month: seasonKey(timeZone, now), wild: null, sequence: 0, nextSpawnAt: 0, paused: false, keepers: [], hallOfFame: [], monthSpawns: 0, monthCatches: 0, guardiansMonth: 0, seen: [], noCritterReplyAt: 0 };
}
function cleanKeeper(raw) {
  return {
    key: clean(raw?.key, 220), viewerId: clean(raw?.viewerId, 128), name: clean(raw?.name, 60) || 'Someone', platform: PLATFORMS.includes(raw?.platform) ? raw.platform : '',
    v: hexMask(raw?.v), g: hexMask(raw?.g),
    c: Array.isArray(raw?.c) ? raw.c.map((key) => clean(key, 60)).filter(Boolean).slice(0, MAX_CUSTOM_CRITTERS) : [],
    cg: Array.isArray(raw?.cg) ? raw.cg.map((key) => clean(key, 60)).filter(Boolean).slice(0, MAX_CUSTOM_CRITTERS) : [],
    catches: integer(raw?.catches, 0, 1_000_000_000, 0), month: integer(raw?.month, 0, 1_000_000, 0), throws: integer(raw?.throws, 0, 1_000_000, 0),
    last: clean(raw?.last, 40), at: integer(raw?.at, 0, Number.MAX_SAFE_INTEGER, 0),
  };
}
function cleanWild(raw) {
  if (!raw || typeof raw !== 'object' || !clean(raw.key, 70)) return null;
  return {
    id: clean(raw.id, 40) || 'wild', key: clean(raw.key, 70), num: integer(raw.num, 0, 10_000, 0), name: clean(raw.name, 40) || '?', rarity: choice(raw.rarity, RARITIES, 'common'),
    type: clean(raw.type, 30), art: clean(raw.art, 40).toLowerCase().replace(/[^a-z]/gu, ''), picture: https(raw.picture), glimmer: raw.glimmer === true,
    platform: PLATFORMS.includes(raw.platform) ? raw.platform : '',
    status: choice(raw.status, ['wild', 'caught', 'fled', 'left'], 'left'), startedAt: integer(raw.startedAt, 0, Number.MAX_SAFE_INTEGER, 0), endsAt: integer(raw.endsAt, 0, Number.MAX_SAFE_INTEGER, 0), endedAt: integer(raw.endedAt, 0, Number.MAX_SAFE_INTEGER, 0),
    caughtBy: Array.isArray(raw.caughtBy) ? raw.caughtBy.map((key) => clean(key, 220)).filter(Boolean).slice(-500) : [],
    lastThrows: Array.isArray(raw.lastThrows) ? raw.lastThrows.filter((row) => Array.isArray(row) && typeof row[0] === 'string').map((row) => [clean(row[0], 220), integer(row[1], 0, Number.MAX_SAFE_INTEGER, 0)]).slice(-300) : [],
    throws: Array.isArray(raw.throws) ? raw.throws.slice(-MAX_THROWS_SHOWN).map((item) => ({
      id: clean(item?.id, 40), keeper: clean(item?.keeper, 60) || 'Someone', platform: PLATFORMS.includes(item?.platform) ? item.platform : '', jar: choice(item?.jar, JARS, 'jar'),
      ok: item?.ok === true, wobbles: integer(item?.wobbles, 0, 3, 0), fled: item?.fled === true, at: integer(item?.at, 0, Number.MAX_SAFE_INTEGER, 0),
    })).filter((item) => item.id) : [],
  };
}
export function stateFor(raw, now = Date.now(), timeZone = 'UTC') {
  const state = emptyState(now, timeZone);
  if (/^\d{4}-(0[1-9]|1[0-2])$/u.test(raw?.month)) state.month = raw.month;
  state.wild = cleanWild(raw?.wild);
  state.sequence = integer(raw?.sequence, 0, Number.MAX_SAFE_INTEGER, 0);
  state.nextSpawnAt = integer(raw?.nextSpawnAt, 0, Number.MAX_SAFE_INTEGER, 0);
  state.paused = raw?.paused === true;
  state.keepers = Array.isArray(raw?.keepers) ? raw.keepers.map(cleanKeeper).filter((keeper) => keeper.key).slice(0, MAX_KEEPERS) : [];
  state.hallOfFame = Array.isArray(raw?.hallOfFame) ? raw.hallOfFame.filter((entry) => entry && /^\d{4}-\d{2}$/u.test(entry.month)).slice(-HALL_OF_FAME_MONTHS).map((entry) => ({
    month: entry.month, spawns: integer(entry.spawns, 0, 1_000_000, 0), catches: integer(entry.catches, 0, 1_000_000, 0),
    leaders: Array.isArray(entry.leaders) ? entry.leaders.slice(0, 3).map((leader) => ({ displayName: clean(leader?.displayName, 60) || 'Someone', platform: PLATFORMS.includes(leader?.platform) ? leader.platform : '', catches: integer(leader?.catches, 0, 1_000_000, 0) })) : [],
  })) : [];
  state.monthSpawns = integer(raw?.monthSpawns, 0, 1_000_000, 0); state.monthCatches = integer(raw?.monthCatches, 0, 1_000_000, 0); state.guardiansMonth = integer(raw?.guardiansMonth, 0, 1_000, 0);
  state.platformVisits = Object.fromEntries(PLATFORMS.map((platform) => [platform, integer(raw?.platformVisits?.[platform], 0, Number.MAX_SAFE_INTEGER, 0)]));
  state.seen = Array.isArray(raw?.seen) ? raw.seen.filter((id) => typeof id === 'string').map((id) => clean(id, 256)).slice(-300) : [];
  state.noCritterReplyAt = integer(raw?.noCritterReplyAt, 0, Number.MAX_SAFE_INTEGER, 0);
  return state;
}

/** Starts a new season on the 1st: last month's top three Keepers go to the hall of fame; Field Journals stay. */
export function rollSeason(state, timeZone, now = Date.now()) {
  const current = seasonKey(timeZone, now);
  if (state.month === current || current < state.month) return false;
  const leaders = [...state.keepers].filter((keeper) => keeper.month > 0).sort((a, b) => b.month - a.month || b.catches - a.catches).slice(0, 3);
  if (leaders.length > 0 || state.monthSpawns > 0) {
    state.hallOfFame.push({ month: state.month, spawns: state.monthSpawns, catches: state.monthCatches, leaders: leaders.map((keeper) => ({ displayName: keeper.name, platform: keeper.platform, catches: keeper.month })) });
    state.hallOfFame = state.hallOfFame.slice(-HALL_OF_FAME_MONTHS);
  }
  state.month = current; state.monthSpawns = 0; state.monthCatches = 0; state.guardiansMonth = 0;
  for (const keeper of state.keepers) { keeper.month = 0; keeper.throws = 0; }
  return true;
}

function keeperFor(state, person) {
  let keeper = state.keepers.find((item) => item.key === person.key);
  if (!keeper) {
    keeper = cleanKeeper({ key: person.key, viewerId: person.viewerId, name: person.name, platform: person.platform });
    state.keepers.push(keeper);
    if (state.keepers.length > MAX_KEEPERS) {
      // Keep the Keepers with the most catches; the newest Keeper always stays.
      const rest = state.keepers.filter((item) => item !== keeper).sort((a, b) => b.catches - a.catches || b.at - a.at).slice(0, MAX_KEEPERS - 1);
      state.keepers = [...rest, keeper];
    }
  }
  keeper.name = person.name || keeper.name; keeper.platform = person.platform || keeper.platform; if (person.viewerId) keeper.viewerId = person.viewerId;
  return keeper;
}
/** How many different critters a Keeper has caught, out of the critters in this game. */
export function journalCount(keeper, pool) {
  return pool.filter((critter) => (critter.num > 0 ? hasCritter(keeper.v, critter.num) : keeper.c.includes(critter.key))).length;
}
function glimmerCount(keeper) { return maskCount(keeper.g) + keeper.cg.length; }
function hasCaught(keeper, critter) { return critter.num > 0 ? hasCritter(keeper.v, critter.num) : keeper.c.includes(critter.key); }
function record(keeper, critter, glimmer) {
  if (critter.num > 0) { keeper.v = withCritter(keeper.v, critter.num); if (glimmer) keeper.g = withCritter(keeper.g, critter.num); }
  else { if (!keeper.c.includes(critter.key)) keeper.c = [...keeper.c, critter.key].slice(-MAX_CUSTOM_CRITTERS); if (glimmer && !keeper.cg.includes(critter.key)) keeper.cg = [...keeper.cg, critter.key].slice(-MAX_CUSTOM_CRITTERS); }
  keeper.catches += 1; keeper.month += 1; keeper.last = critter.name; keeper.at = Date.now();
}

// ---------- Spawning ----------
/** Picks a rarity by the creator's weights (Guardians stop after the monthly limit), then a critter of that rarity. */
export function pickCritter(pool, settings, state, pick = randomInt) {
  if (pool.length === 0) return undefined;
  const allowed = RARITIES.filter((rarity) => settings.weights[rarity] > 0 && pool.some((critter) => critter.rarity === rarity) && (rarity !== 'guardian' || state.guardiansMonth < settings.guardianMonthlyLimit));
  if (allowed.length === 0) return pool[pick(pool.length)];
  const total = allowed.reduce((sum, rarity) => sum + settings.weights[rarity], 0);
  let ticket = pick(total);
  let rarity = allowed[0];
  for (const item of allowed) { if (ticket < settings.weights[item]) { rarity = item; break; } ticket -= settings.weights[item]; }
  const candidates = pool.filter((critter) => critter.rarity === rarity);
  return candidates[pick(candidates.length)];
}
function findCritter(pool, text) {
  const wanted = matchKey(text).replace(/^#/u, '');
  if (!wanted) return undefined;
  const number = Number(wanted);
  return pool.find((critter) => matchKey(critter.name) === wanted || (Number.isInteger(number) && number > 0 && critter.num === number));
}
function nextSpawnDelay(settings, pick = randomInt) {
  const minimum = settings.spawnMinMinutes * 60_000; const maximum = settings.spawnMaxMinutes * 60_000;
  return minimum + (maximum > minimum ? pick(maximum - minimum + 1) : 0);
}

// ---------- Overlay ----------
export function wildView(settings, state, now = Date.now()) {
  const wild = state.wild;
  if (!settings.enabled || !wild) return { moduleId: MODULE_ID, cardKind: 'critter-catch', visible: false };
  return {
    moduleId: MODULE_ID, cardKind: 'critter-catch', visible: true, spawnId: wild.id, status: wild.status,
    position: settings.position, size: settings.size, showKeepers: settings.showKeepers,
    hint: fill(settings.commandPlatforms.length < settings.platforms.length && settings.rewardThrows.length > 0 ? settings.mixedHintText : settings.hintText, { command: settings.command }),
    remainingMs: wild.status === 'wild' ? Math.max(0, wild.endsAt - now) : 0, durationMs: Math.max(1_000, wild.endsAt - wild.startedAt),
    platform: wild.platform || '', platformName: wild.platform ? PLATFORM_LABELS[wild.platform] : '',
    critter: { number: wild.num, name: wild.name, rarity: wild.rarity, rarityName: rarityName(settings, wild.rarity), type: wild.type, art: wild.art, picture: wild.picture, glimmer: wild.glimmer },
    labels: { wild: settings.wildLabel, glimmer: settings.glimmerLabel, caught: settings.caughtWord, brokeFree: settings.brokeFreeWord, ranOff: settings.ranOffWord, jars: { jar: settings.jarNames[0], honey: settings.jarNames[1], moon: settings.jarNames[2] } },
    throws: wild.throws.map((item) => ({ id: item.id, keeper: settings.showKeepers ? item.keeper : '', platform: item.platform, jar: item.jar, ok: item.ok, wobbles: item.wobbles, fled: item.fled })),
  };
}
async function publish(context, settings, state) {
  const view = wildView(settings, state);
  if (!view.visible) { await context.overlay.publish(`${MODULE_ID}.critters.hide`, {}, { lane: 'persistent' }).catch(() => undefined); return; }
  await context.overlay.publish(`${MODULE_ID}.critters.update`, { ...view, emittedAt: new Date().toISOString() }, { lane: 'persistent' }).catch(() => undefined);
}

// ---------- Game flow ----------
let stopped = true;
let operation = Promise.resolve();
let spawnTask;
let endTask;
let lastChatAt = 0;
/** Recent real chatters per platform (own accounts, the streamer and bots are left out), for picking where a critter visits. */
const chatters = new Map();
function noteChatter(event) {
  const roles = Array.isArray(event.user?.roles) ? event.user.roles.map((role) => String(role).toLowerCase()) : [];
  if (event.payload?.fromConnectedAccount === true || roles.includes('broadcaster') || roles.includes('owner') || roles.includes('streamer') || roles.includes('bot')) return;
  if (event.user?.actorType && event.user.actorType !== 'human') return;
  const key = clean(event.user?.id || event.user?.name, 200);
  if (!key) return;
  const list = chatters.get(event.platform) ?? new Map();
  list.set(key, Date.now());
  if (list.size > 2_000) list.delete(list.keys().next().value);
  chatters.set(event.platform, list);
}
/** Platforms with enough recent chatters, the one that waited longest since its last visit first. */
export function activePlatforms(settings, state, now = Date.now()) {
  const cutoff = now - settings.activeMinutes * 60_000;
  return settings.platforms.filter((platform) => {
    const list = chatters.get(platform);
    if (!list) return false;
    let count = 0;
    for (const [key, at] of list) { if (at >= cutoff) count += 1; else list.delete(key); }
    return count >= settings.activeChatters;
  }).sort((a, b) => (state.platformVisits?.[a] ?? 0) - (state.platformVisits?.[b] ?? 0) || PLATFORMS.indexOf(a) - PLATFORMS.indexOf(b));
}
export function resetChatters() { chatters.clear(); lastChatAt = 0; }
function targetsFor(settings, wild) { return wild?.platform ? [wild.platform] : settings.platforms; }
const noPointsReplies = new Map();

/** Tells a viewer why their throw did nothing, at most once every 30 seconds per viewer and reason. */
async function explain(context, platform, key, reason, message) {
  if (!platform || !message) return;
  const slot = `${reason}:${key}`;
  if (Date.now() - (noPointsReplies.get(slot) ?? 0) <= 30_000) return;
  noPointsReplies.set(slot, Date.now());
  if (noPointsReplies.size > 500) noPointsReplies.delete(noPointsReplies.keys().next().value);
  await sayOn(context, [platform], message);
}

async function load(context, settings) {
  const state = stateFor(await context.state.read(), Date.now(), settings.timeZone);
  if (rollSeason(state, settings.timeZone)) await save(context, state);
  return state;
}
async function save(context, state) { await context.state.write(JSON.parse(JSON.stringify(state))); }
function serialize(task) { const next = operation.then(task, task); operation = next.catch(() => undefined); return next; }
function cancelTasks(context) {
  if (spawnTask !== undefined) context?.schedule?.cancel(spawnTask); spawnTask = undefined;
  if (endTask !== undefined) context?.schedule?.cancel(endTask); endTask = undefined;
}
function later(context, delayMs, task) {
  try { return context.schedule.after(Math.max(1_000, Math.min(86_400_000, Math.round(delayMs))), task); } catch { return undefined; }
}

/** Plans the next visit (or the current critter's departure) from the saved state. */
function plan(context, settings, state) {
  cancelTasks(context);
  if (stopped || !settings.enabled) return;
  const now = Date.now();
  const wild = state.wild;
  if (wild && wild.status === 'wild') {
    const wildId = wild.id;
    endTask = later(context, wild.endsAt - now, () => serialize(async () => {
      endTask = undefined; if (stopped) return;
      const fresh = settingsFor(context); if (!fresh.enabled) return;
      const latest = await load(context, fresh);
      if (latest.wild?.id === wildId && latest.wild.status === 'wild') await endWild(context, fresh, latest, 'left');
    }));
    return;
  }
  if (state.paused) return;
  const at = state.nextSpawnAt > 0 ? state.nextSpawnAt : now + nextSpawnDelay(settings);
  spawnTask = later(context, at - now, () => serialize(async () => {
    spawnTask = undefined; if (stopped) return;
    const fresh = settingsFor(context); if (!fresh.enabled) return;
    const latest = await load(context, fresh);
    if (latest.paused || latest.wild?.status === 'wild') return;
    if (fresh.visitMode === 'active-platform') {
      // The critter visits the platform whose chat is active and has waited longest; the others queue for the next visits.
      const platform = activePlatforms(fresh, latest)[0];
      if (!platform) { latest.nextSpawnAt = Date.now() + 120_000; await save(context, latest); plan(context, fresh, latest); return; }
      await spawn(context, fresh, latest, undefined, { platform });
      return;
    }
    if (fresh.onlyWhenChatting && Date.now() - lastChatAt > CHAT_QUIET_MS) {
      // Nobody is chatting (the stream is probably offline): look again in two minutes instead of spawning to an empty room.
      latest.nextSpawnAt = Date.now() + 120_000; await save(context, latest); plan(context, fresh, latest); return;
    }
    await spawn(context, fresh, latest);
  }));
}

export async function spawn(context, settings, state, wanted, { announce = true, pick = randomInt, platform = '' } = {}) {
  const pool = critterPool(settings);
  const critter = wanted ?? pickCritter(pool, settings, state, pick);
  if (!critter) return undefined;
  const now = Date.now();
  const glimmer = settings.glimmerOdds > 0 && pick(settings.glimmerOdds) === 0;
  state.sequence += 1; state.monthSpawns += 1; if (critter.rarity === 'guardian') state.guardiansMonth += 1;
  state.wild = {
    id: `w${String(state.sequence)}-${now.toString(36)}`, key: critter.key, num: critter.num, name: critter.name, rarity: critter.rarity, type: critter.type, art: critter.art, picture: critter.picture, glimmer,
    platform: PLATFORMS.includes(platform) && settings.platforms.includes(platform) ? platform : '',
    status: 'wild', startedAt: now, endsAt: now + settings.seconds[critter.rarity] * 1_000, endedAt: 0, caughtBy: [], lastThrows: [], throws: [],
  };
  state.nextSpawnAt = 0;
  if (state.wild.platform) state.platformVisits[state.wild.platform] = now;
  await save(context, state); await publish(context, settings, state);
  plan(context, settings, state);
  await setRewards(context, settings, true, state.wild.platform);
  if (announce && settings.announceSpawns) {
    const values = { critter: critter.name, rarity: rarityName(settings, critter.rarity), type: critter.type, command: settings.command };
    const targets = targetsFor(settings, state.wild);
    const rewardOnly = targets.filter((item) => !settings.commandPlatforms.includes(item));
    await sayOn(context, targets.filter((item) => settings.commandPlatforms.includes(item)), fill(glimmer ? settings.glimmerSpawnMessage : settings.spawnMessage, values));
    await sayOn(context, rewardOnly, fill(settings.rewardSpawnMessage, { ...values, critter: glimmer ? `${settings.glimmerLabel} ${critter.name}` : critter.name }));
  }
  return state.wild;
}

async function endWild(context, settings, state, reason, { announce = true } = {}) {
  const wild = state.wild;
  if (!wild || wild.status !== 'wild') return;
  wild.status = reason; wild.endedAt = Date.now();
  state.nextSpawnAt = Date.now() + nextSpawnDelay(settings);
  await save(context, state); await publish(context, settings, state);
  plan(context, settings, state);
  await setRewards(context, settings, false, wild.platform);
  if (announce && reason === 'left' && settings.announceLeaves && wild.caughtBy.length === 0) await sayOn(context, targetsFor(settings, wild), fill(settings.leftMessage, { critter: wild.name, command: settings.command }));
}

function critterFromWild(settings, wild) {
  return critterPool(settings).find((critter) => critter.key === wild.key) ?? { key: wild.key, num: wild.num, name: wild.name, rarity: wild.rarity, type: wild.type, base: CUSTOM_RATES[wild.rarity] ?? 30 };
}

/** One throw: pays for the jar (unless a reward or gift paid already), rolls it fairly and records the result. */
export async function throwJar(context, settings, state, event, jar, { paid = true, pick = randomInt } = {}) {
  const wild = state.wild;
  const name = clean(event.user?.displayName || event.user?.name, 60) || 'Someone';
  const platform = PLATFORMS.includes(event.platform) ? event.platform : '';
  if (!wild || wild.status !== 'wild' || Date.now() >= wild.endsAt) {
    if (wild?.status === 'wild') await endWild(context, settings, state, 'left');
    await explain(context, platform, `${platform}:${name}`, 'none', fill(settings.noCritterMessage, { name, command: settings.command }));
    return { result: 'none' };
  }
  // A critter visiting one platform can only be caught from that platform's chat.
  if (wild.platform && platform && platform !== wild.platform) {
    await explain(context, platform, `${platform}:${name}`, 'elsewhere', fill(settings.elsewhereMessage, { name, critter: wild.name, platformName: PLATFORM_LABELS[wild.platform] ?? wild.platform, command: settings.command }));
    return { result: 'elsewhere' };
  }
  const viewerId = await viewerIdFor(context, event);
  const key = playerKey(event, viewerId);
  if (!key) return { result: 'none' };
  if (wild.caughtBy.includes(key)) {
    await explain(context, platform, key, 'already', fill(settings.alreadyMessage, { name, critter: wild.name, command: settings.command }));
    return { result: 'already' };
  }
  const last = wild.lastThrows.find((row) => row[0] === key)?.[1] ?? 0;
  if (paid && settings.throwCooldownSeconds > 0 && Date.now() - last < settings.throwCooldownSeconds * 1_000) {
    const seconds = Math.max(1, Math.ceil((last + settings.throwCooldownSeconds * 1_000 - Date.now()) / 1_000));
    await explain(context, platform, key, 'cooldown', fill(settings.cooldownMessage, { name, seconds: String(seconds), command: settings.command }));
    return { result: 'cooldown' };
  }
  const eventId = clean(event.eventId || event.source?.eventId, 200);
  if (eventId) { if (state.seen.includes(eventId)) return { result: 'duplicate' }; state.seen.push(eventId); state.seen = state.seen.slice(-300); }
  const cost = paid ? settings.costs[jar] : 0;
  if (cost > 0) {
    let projection;
    try { projection = viewerId ? await context.viewerFoundation.mutate({ viewerId, operation: 'spend', amount: cost, reason: `Critter Catch ${JAR_LABELS[JARS.indexOf(jar)]}`, idempotencyKey: clean(`critter-${wild.id}-${eventId || `${key}-${String(Date.now())}`}`, 128) }) : undefined; }
    catch { projection = undefined; }
    if (!projection) {
      const repliedAt = noPointsReplies.get(key) ?? 0;
      if (Date.now() - repliedAt > 30_000 && platform) {
        noPointsReplies.set(key, Date.now()); if (noPointsReplies.size > 500) noPointsReplies.delete(noPointsReplies.keys().next().value);
        let points = 0; let currency = 'points';
        try { const current = viewerId ? await context.viewerFoundation.getProjection({ platform: event.platform, userId: clean(event.user?.id, 256) }) : undefined; points = current?.points ?? 0; currency = clean(current?.currencyName, 40) || 'points'; } catch { /* keep the defaults */ }
        await sayOn(context, [platform], fill(settings.noPointsMessage, { name, jar: jarName(settings, jar), cost: String(cost), points: String(points), currency }));
      }
      await save(context, state);
      return { result: 'no-points' };
    }
  }
  const critter = critterFromWild(settings, wild);
  const chance = catchChance(critter, jar, wild.glimmer, settings);
  const ok = roll(pick) * 100 < chance;
  const wobbles = ok ? 3 : pick(3);
  const fled = !ok && pick(100) < settings.flee[wild.rarity];
  const keeper = keeperFor(state, { key, viewerId, name, platform });
  keeper.throws += 1;
  wild.lastThrows = [...wild.lastThrows.filter((row) => row[0] !== key), [key, Date.now()]].slice(-300);
  wild.throws = [...wild.throws, { id: `t${String(Date.now())}-${String(pick(1_000_000))}`, keeper: name, platform, jar, ok, wobbles, fled, at: Date.now() }].slice(-MAX_THROWS_SHOWN);
  const values = { name, critter: wild.name, jar: jarName(settings, jar), rarity: rarityName(settings, wild.rarity), command: settings.command };
  if (ok) {
    record(keeper, critter, wild.glimmer);
    wild.caughtBy = [...wild.caughtBy, key].slice(-500);
    state.monthCatches += 1;
    const pool = critterPool(settings);
    const firstCatch = wild.caughtBy.length === 1;
    const number = critter.num > 0 ? String(critter.num).padStart(3, '0') : '';
    const message = fill(wild.glimmer ? settings.glimmerCaughtMessage : settings.caughtMessage, { ...values, number, count: String(journalCount(keeper, pool)), total: String(pool.length) });
    const entryLine = settings.announceEntry && firstCatch && critter.entry ? fill(settings.entryMessage, { ...values, number: number || '—', entry: critter.entry, type: critter.type || '—' }).replace(/#—\s*/u, '') : '';
    if (settings.catchMode === 'first') { await endWild(context, settings, state, 'caught'); }
    else { await save(context, state); await publish(context, settings, state); }
    if (platform) { await sayOn(context, targetsFor(settings, wild), message); if (entryLine) await sayOn(context, targetsFor(settings, wild), entryLine); }
    return { result: 'caught', chance };
  }
  if (fled) {
    await endWild(context, settings, state, 'fled');
    await sayOn(context, targetsFor(settings, wild), fill(settings.fledMessage, values));
    return { result: 'fled', chance };
  }
  await save(context, state); await publish(context, settings, state);
  if (settings.announceMisses && platform) await sayOn(context, [platform], fill(settings.missedMessage, values));
  return { result: 'missed', chance };
}

function jarFrom(settings, word) {
  const text = matchKey(word);
  if (!text) return 'jar';
  if (text === settings.honeyWord || text === 'honey' || text === 'h' || text === matchKey(settings.jarNames[1])) return 'honey';
  if (text === settings.moonWord || text === 'moon' || text === 'm' || text === matchKey(settings.jarNames[2])) return 'moon';
  return 'jar';
}

async function onCommand(event, context, settings) {
  if (clean(event.payload?.command, 40).toLowerCase() !== settings.command) return;
  if (!settings.platforms.includes(event.platform) && event.platform !== 'system') return;
  if (event.user?.actorType && event.user.actorType !== 'human') return;
  const args = Array.isArray(event.payload?.arguments) ? event.payload.arguments.map((arg) => clean(String(arg), 40)) : [];
  const sub = matchKey(args[0] ?? '');
  const state = await load(context, settings);
  const name = clean(event.user?.displayName || event.user?.name, 60) || 'Someone';
  const reply = (message) => sayOn(context, [event.platform], message);
  if (['spawn', 'end', 'pause', 'resume'].includes(sub)) {
    if (!moderator(event)) return;
    if (sub === 'spawn') {
      const pool = critterPool(settings);
      const wanted = args.length > 1 ? findCritter(pool, args.slice(1).join(' ')) : undefined;
      if (args.length > 1 && !wanted) { await reply(`No critter called "${clean(args.slice(1).join(' '), 40)}".`); return; }
      if (state.wild?.status === 'wild') await endWild(context, settings, state, 'left', { announce: false });
      await spawn(context, settings, state, wanted, { platform: settings.visitMode === 'active-platform' && event.platform !== 'system' ? event.platform : '' });
    } else if (sub === 'end') await endWild(context, settings, state, 'left', { announce: false });
    else { state.paused = sub === 'pause'; if (!state.paused) state.nextSpawnAt = 0; await save(context, state); plan(context, settings, state); await reply(state.paused ? 'Critters will stop visiting until !' + settings.command + ' resume.' : 'Critters will visit again.'); }
    return;
  }
  if (['journal', 'me', 'stats', 'dex'].includes(sub)) {
    const viewerId = await viewerIdFor(context, event);
    const keeper = state.keepers.find((item) => item.key === playerKey(event, viewerId));
    const pool = critterPool(settings);
    await reply(fill(settings.journalMessage, { name, count: String(keeper ? journalCount(keeper, pool) : 0), total: String(pool.length), glimmers: String(keeper ? glimmerCount(keeper) : 0), month: String(keeper?.month ?? 0) }));
    return;
  }
  if (sub === 'top') {
    const top = [...state.keepers].filter((keeper) => keeper.month > 0).sort((a, b) => b.month - a.month || b.catches - a.catches).slice(0, 3);
    await reply(top.length ? fill(settings.topMessage, { top: top.map((keeper, index) => `${String(index + 1)}. ${keeper.name} (${String(keeper.month)})`).join(', ') }) : settings.noCatchesMessage);
    return;
  }
  if (sub === 'info') {
    const pool = critterPool(settings);
    const critter = findCritter(pool, args.slice(1).join(' '));
    if (!critter) { if (args.length > 1) await reply(`No critter called "${clean(args.slice(1).join(' '), 40)}".`); return; }
    const viewerId = await viewerIdFor(context, event);
    const keeper = state.keepers.find((item) => item.key === playerKey(event, viewerId));
    if (!keeper || !hasCaught(keeper, critter)) { await reply(fill(settings.notCaughtMessage, { name, critter: critter.name })); return; }
    await reply(fill(settings.infoMessage, { number: critter.num > 0 ? String(critter.num).padStart(3, '0') : '—', critter: critter.name, rarity: rarityName(settings, critter.rarity), type: critter.type || '—', entry: critter.entry || '…' }));
    return;
  }
  if (event.platform !== 'system' && !settings.commandPlatforms.includes(event.platform)) {
    const repliedAt = noPointsReplies.get(`reward:${event.platform}:${name}`) ?? 0;
    if (Date.now() - repliedAt > 30_000) { noPointsReplies.set(`reward:${event.platform}:${name}`, Date.now()); await reply(fill(settings.rewardOnlyMessage, { name, command: settings.command })); }
    return;
  }
  await throwJar(context, settings, state, event, jarFrom(settings, sub));
}

async function onPaidThrow(event, context, settings) {
  if (!settings.platforms.includes(event.platform) || settings.rewardThrows.length === 0) return;
  const reward = event.eventType === 'reward.redemption';
  const id = reward ? matchKey(event.payload?.rewardId) : '';
  const title = matchKey(reward ? event.payload?.rewardTitle : event.payload?.itemName);
  const match = settings.rewardThrows.find((item) => (id && item.name === id) || item.name === title);
  if (!match) return;
  const state = await load(context, settings);
  const outcome = await throwJar(context, settings, state, event, match.jar, { paid: false });
  // Channel points come back when the Jar could not be thrown (no critter, or this Keeper already caught it).
  if (reward && ['none', 'already', 'elsewhere'].includes(outcome?.result)) await refundRedemption(context, event);
}

async function process(event, context) {
  const settings = settingsFor(context);
  if (!settings.enabled) return;
  if (event.eventType === 'chat.message') {
    if (settings.platforms.includes(event.platform) && event.payload?.fromConnectedAccount !== true && (!event.user?.actorType || event.user.actorType === 'human') && event.metadata?.simulated !== true) { lastChatAt = Date.now(); noteChatter(event); }
    return;
  }
  if (event.eventType === 'command.received') { await onCommand(event, context, settings); return; }
  if (event.metadata?.simulated === true) return;
  if (event.eventType === 'reward.redemption' || event.eventType === 'engagement.gift') await onPaidThrow(event, context, settings);
}

// ---------- Control Panel ----------
function ago(ms) { const minutes = Math.max(0, Math.round(ms / 60_000)); return minutes < 1 ? 'less than a minute' : `${String(minutes)} minute${minutes === 1 ? '' : 's'}`; }

async function critterPanel(request, context) {
  const settings = settingsFor(context);
  let message = '';
  if (request?.operation === 'settings-changed') { const state = await load(context, settings); await publish(context, settings, state); plan(context, settings, state); return {}; }
  if (request?.operation === 'action') {
    if (!settings.enabled) throw new Error('Critter Catch is switched off in its settings.');
    const action = clean(request.action, 40);
    const state = await load(context, settings);
    if (action === 'spawn' || action === 'spawn-quiet' || action === 'spawn-named') {
      const pool = critterPool(settings);
      const wanted = action === 'spawn-named' ? findCritter(pool, String(request.values?.critter ?? '')) : undefined;
      if (action === 'spawn-named' && !wanted) throw new Error('No critter has that name or number.');
      if (state.wild?.status === 'wild') await endWild(context, settings, state, 'left', { announce: false });
      const wild = await spawn(context, settings, state, wanted, { announce: action !== 'spawn-quiet', platform: settings.visitMode === 'active-platform' ? (activePlatforms(settings, state)[0] ?? '') : '' });
      message = wild ? `${wild.glimmer ? 'Glimmer ' : ''}${wild.name} wandered in${wild.platform ? ` on ${PLATFORM_LABELS[wild.platform]}` : ' on every platform'}.` : 'No critters to choose from.';
    } else if (action === 'end') { await endWild(context, settings, state, 'left', { announce: false }); message = 'The critter wandered off.'; }
    else if (action === 'pause' || action === 'resume') { state.paused = action === 'pause'; if (!state.paused) state.nextSpawnAt = 0; await save(context, state); plan(context, settings, state); message = state.paused ? 'Visits paused.' : 'Visits resumed.'; }
    else throw new Error('Unknown Critter Catch control.');
  }
  const state = await load(context, settings);
  const pool = critterPool(settings);
  const wild = state.wild;
  const leaders = [...state.keepers].filter((keeper) => keeper.month > 0).sort((a, b) => b.month - a.month || b.catches - a.catches).slice(0, 10);
  const now = Date.now();
  const active = activePlatforms(settings, state, now);
  const next = state.paused ? 'Paused' : wild?.status === 'wild' ? 'After this one' : state.nextSpawnAt > now ? `In about ${ago(state.nextSpawnAt - now)}` : settings.visitMode === 'active-platform' ? (active.length ? 'Soon' : 'When a chat is active') : settings.onlyWhenChatting && now - lastChatAt > CHAT_QUIET_MS ? 'When chat is active' : 'Soon';
  return {
    ...(message ? { message } : {}),
    ...(settings.enabled ? {} : { notice: 'Critter Catch is switched off in its settings.' }),
    summary: [
      { label: 'Wandering now', value: wild?.status === 'wild' ? `${wild.glimmer ? 'Glimmer ' : ''}${wild.name} (${rarityName(settings, wild.rarity)})${wild.platform ? ` on ${PLATFORM_LABELS[wild.platform]}` : ''}` : 'Nobody' },
      ...(settings.visitMode === 'active-platform' ? [{ label: 'Active chats (next visit first)', value: active.length ? active.map((item) => PLATFORM_LABELS[item]).join(', ') : 'None yet' }] : []),
      { label: 'Next visit', value: next },
      { label: `Catches in ${state.month}`, value: String(state.monthCatches) },
      { label: 'Keepers', value: String(state.keepers.length) },
      { label: 'Critters', value: String(pool.length) },
    ],
    actions: [
      { action: 'spawn', label: 'Send a critter now', style: 'primary' },
      { action: 'spawn-quiet', label: 'Send one (no chat)' },
      { action: 'spawn-named', label: 'Send a chosen critter', inputs: [{ name: 'critter', label: 'Name or number', type: 'text' }] },
      ...(state.paused ? [{ action: 'resume', label: 'Resume visits' }] : [{ action: 'pause', label: 'Pause visits' }]),
      { action: 'end', label: 'Send it away', style: 'danger', confirm: 'Make the critter on screen wander off?' },
    ],
    lists: [
      { title: 'Throws at this critter', empty: wild?.status === 'wild' ? `Keepers throw with !${settings.command}.` : 'No critter on screen.', items: wild ? [...wild.throws].reverse().map((item) => ({ title: `${item.keeper} · ${jarName(settings, item.jar)}`, badge: item.ok ? '✓' : item.fled ? '↯' : '✗', detail: item.ok ? 'Caught' : item.fled ? 'Missed, and it ran off' : 'Missed' })) : [] },
      { title: `Top Keepers in ${state.month}`, empty: 'No catches yet this month.', items: leaders.map((keeper, index) => ({ title: `${String(index + 1)}. ${keeper.name}`, detail: `${String(keeper.month)} caught this month · Field Journal ${String(journalCount(keeper, pool))} of ${String(pool.length)}${keeper.platform ? ` · ${PLATFORM_LABELS[keeper.platform]}` : ''}` })) },
      { title: 'Hall of fame', empty: 'Past months show here after the 1st.', items: [...state.hallOfFame].reverse().map((entry) => ({ title: entry.month, detail: entry.leaders.length ? entry.leaders.map((leader, index) => `${String(index + 1)}. ${leader.displayName} (${String(leader.catches)})`).join(' · ') : `${String(entry.spawns)} visits, no catches` })) },
    ],
  };
}

const manifest = {
  contractVersion: '2.0.0-preview.1', moduleId: MODULE_ID, name: 'Critter Catch', version: '4.1.69',
  minimumCoreVersion: '2.0.0-preview.1', maximumTestedCoreVersion: '2.0.0-preview.1', minimumBridgeVersion: '4.1.69', maximumTestedBridgeVersion: '4.1.69',
  dependencies: ['thsv.viewer-foundation'], requiredCapabilities: [], configurationSchema: 'schemas/config.json',
  eventSubscriptions: ['chat.message', 'command.received', 'reward.redemption', 'engagement.gift'],
  commandsProvided: [{ id: 'critter-catch.play', name: 'catch' }], actionsProvided: [], browserSourcesProvided: [],
  dataStorageOwned: [`data/addons/${MODULE_ID}/`, `data/addons/.state/${MODULE_ID}/`],
  installationSteps: [
    'Pick the Village Critters, your own critters, or both, and set what a Jar costs in Viewer Foundation points.',
    'Add the overlay as a browser source in the scenes where critters should wander in.',
    'Enable the extension and restart StreamBridge. Press Send a critter now in the Control Panel to test it.',
  ],
  uninstallationSteps: ['Disable the extension and remove its browser source. Field Journals and monthly catches are kept until you delete its data.'], migrations: [],
  healthChecks: [{ id: `${MODULE_ID}.runtime`, description: 'Confirms critters wander in on schedule, throws are paid and rolled fairly, catches land in Field Journals, and monthly stats reset on the 1st.' }],
};

export { manifest };

export default {
  manifest, required: false,
  async start(context) {
    stopped = false; operation = Promise.resolve(); spawnTask = undefined; endTask = undefined; noPointsReplies.clear();
    const settings = settingsFor(context);
    const state = await load(context, settings);
    // A critter that was on screen when StreamBridge stopped has wandered off by now.
    if (state.wild?.status === 'wild' && Date.now() >= state.wild.endsAt) { state.wild.status = 'left'; state.wild.endedAt = Date.now(); state.nextSpawnAt = 0; }
    if (state.wild && state.wild.status !== 'wild') state.wild = null;
    await save(context, state);
    await publish(context, settings, state);
    plan(context, settings, state);
    if (state.wild?.status !== 'wild') await setRewards(context, settings, false);
  },
  async stop(context) { stopped = true; cancelTasks(context); await operation.catch(() => undefined); },
  async onEvent(event, context) { if (!stopped) await serialize(() => process(event, context)); },
  async controlPanel(request, context) { return serialize(() => critterPanel(request, context)); },
};
