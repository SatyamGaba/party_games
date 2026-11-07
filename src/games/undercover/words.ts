import type { Category, WordPair } from "./rules";

/** Built-in pairs. Server-only: these are the secrets. "a/b" per entry. */
const RAW: Record<Category, string> = {
  "Food & drink":
    "Coffee/Tea, Pizza/Burger, Butter/Margarine, Honey/Jam, Sushi/Sashimi, Pancake/Waffle, Ketchup/Mustard, Wine/Beer, Croissant/Bagel, Ice cream/Frozen yogurt, Lemon/Lime, Donut/Muffin, Popcorn/Chips, Spaghetti/Noodles, Milk/Cream, Chocolate/Caramel, Cake/Pie, Sandwich/Wrap, Soup/Stew, Salt/Sugar, Orange/Tangerine, Strawberry/Raspberry, Cheese/Tofu, Taco/Burrito, Juice/Smoothie, Bread/Toast, Rice/Couscous, Cookie/Cracker, Apple/Pear, Lemonade/Soda",
  Animals:
    "Cat/Tiger, Dog/Wolf, Horse/Zebra, Lion/Leopard, Shark/Dolphin, Crocodile/Alligator, Rabbit/Hamster, Eagle/Hawk, Bee/Wasp, Frog/Toad, Butterfly/Moth, Penguin/Puffin, Owl/Bat, Duck/Goose, Monkey/Gorilla, Spider/Scorpion, Snake/Lizard, Camel/Llama, Mouse/Rat, Sheep/Goat, Octopus/Squid, Turtle/Tortoise, Deer/Moose, Parrot/Peacock, Whale/Seal",
  Places:
    "Beach/Desert, Library/Bookstore, Hospital/Pharmacy, Airport/Train station, Museum/Gallery, Cinema/Theater, Zoo/Aquarium, Hotel/Hostel, Gym/Stadium, Restaurant/Cafe, School/University, Church/Temple, Castle/Palace, Forest/Jungle, Mountain/Volcano, Lake/Pond, Island/Peninsula, Supermarket/Market, Bank/Post office, Prison/Police station, Farm/Ranch, Park/Garden, Office/Factory, Bakery/Butcher, Casino/Arcade",
  Objects:
    "Pen/Pencil, Fork/Spoon, Chair/Stool, Pillow/Cushion, Laptop/Tablet, Watch/Clock, Umbrella/Raincoat, Mirror/Window, Candle/Lamp, Key/Lock, Wallet/Purse, Glasses/Sunglasses, Backpack/Suitcase, Comb/Brush, Scissors/Knife, Hammer/Screwdriver, Bottle/Jar, Blanket/Towel, Bed/Sofa, Shoe/Sock, Hat/Helmet, Ring/Necklace, Toothbrush/Toothpaste, Phone/Walkie-talkie, Stapler/Paperclip",
  Jobs:
    "Doctor/Nurse, Teacher/Professor, Chef/Baker, Pilot/Astronaut, Police officer/Detective, Firefighter/Paramedic, Lawyer/Judge, Actor/Singer, Painter/Sculptor, Farmer/Gardener, Dentist/Surgeon, Plumber/Electrician, Waiter/Bartender, Journalist/Writer, Soldier/Guard, Magician/Clown, Barber/Hairdresser, Architect/Engineer, Mechanic/Driver, Scientist/Inventor, Cashier/Accountant, Photographer/Filmmaker, Librarian/Archivist, Tailor/Designer, Lifeguard/Coach",
  "Sports & hobbies":
    "Football/Rugby, Tennis/Badminton, Basketball/Volleyball, Swimming/Diving, Skiing/Snowboarding, Boxing/Wrestling, Golf/Mini golf, Cycling/Running, Chess/Checkers, Yoga/Pilates, Surfing/Skateboarding, Baseball/Cricket, Bowling/Billiards, Karate/Judo, Hiking/Climbing, Knitting/Sewing, Fishing/Hunting, Dancing/Singing, Poker/Blackjack, Darts/Archery, Kayaking/Rowing, Ballet/Gymnastics, Hockey/Lacrosse, Painting/Drawing, Camping/Picnic",
  Entertainment:
    "Harry Potter/Lord of the Rings, Batman/Superman, Netflix/YouTube, Guitar/Violin, Piano/Organ, Drum/Tambourine, Cartoon/Anime, Novel/Comic, Podcast/Radio, Concert/Festival, Karaoke/Musical, Mickey Mouse/Bugs Bunny, Star Wars/Star Trek, Video game/Board game, Selfie/Portrait, Disco/Rave, Circus/Carnival, Puzzle/Riddle, Lego/Playdough, Magazine/Newspaper, Zombie/Vampire, Pirate/Ninja, Dragon/Dinosaur, Wizard/Witch, Robot/Alien",
  Nature:
    "Sun/Moon, Rain/Snow, Rainbow/Aurora, River/Waterfall, Rose/Tulip, Tree/Bush, Thunder/Lightning, Cloud/Fog, Star/Planet, Ocean/Sea, Sand/Mud, Fire/Lava, Wind/Tornado, Ice/Glacier, Leaf/Petal, Cactus/Aloe, Earthquake/Tsunami, Sunrise/Sunset, Cave/Tunnel, Mushroom/Moss",
  "Diwali 2026":
    "Rangoli/Mehendi, Kurta/Sherwani, Pani Puri/Dahi Puri, K3G/Hum Saath Saath Hain, Gulab Jamun/Rasgulla, Shah Rukh Khan/Salman Khan, Samosa/Kachori, Kajal/Eyeliner",
};

export const BUILT_IN_PAIRS: WordPair[] = Object.entries(RAW).flatMap(
  ([category, list]) =>
    list.split(",").map((entry) => {
      const [a, b] = entry.split("/").map((w) => w.trim());
      return { a, b, category };
    }),
);

