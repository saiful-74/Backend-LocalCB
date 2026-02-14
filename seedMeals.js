const { MongoClient } = require("mongodb");
require("dotenv").config();

const uri = process.env.MONGO_URI;

const meals = [
  {
    name: "Classic Cheeseburger",
    image: "https://i.ibb.co/Fk3qt0HW/shine-studio-xg-Aeml2-S7y-U-unsplash.jpg",
    price: 12.99,
    category: "Lunch",
    ingredients: ["Beef patty", "Cheddar cheese", "Lettuce", "Tomato", "Brioche bun"],
    description: "Juicy beef patty with melted cheddar, fresh lettuce, and tomato in a soft brioche bun.",
    status: "Available",
    chefName: "Hans Müller",
    chefEmail: "hans.mueller@example.com",
    chefId: "chef-001",
    chefLocation: "Berlin",
    estimatedDeliveryTime: 30,
    rating: 4.7,
    createdAt: new Date(),
  },
  {
    name: "Margherita Pizza",
    image: "https://i.ibb.co/pB9KxJf5/ivan-torres-MQUqbmsz-GGM-unsplash.jpg",
    price: 14.5,
    category: "Dinner",
    ingredients: ["Pizza dough", "Tomato sauce", "Fresh mozzarella", "Basil", "Olive oil"],
    description: "Classic Italian pizza with San Marzano tomatoes, fresh mozzarella, and basil leaves.",
    status: "Available",
    chefName: "Klaus Schmidt",
    chefEmail: "klaus.schmidt@example.com",
    chefId: "chef-002",
    chefLocation: "Munich",
    estimatedDeliveryTime: 40,
    rating: 4.9,
    createdAt: new Date(),
  },
  {
    name: "Wiener Schnitzel",
    image: "https://i.ibb.co/G4RrK55f/fried-chicken-along-with-potatoes-red-tomatoe-inside-white-plate-brown-desk.jpg",
    price: 18.9,
    category: "Dinner",
    ingredients: ["Veal", "Breadcrumbs", "Egg", "Flour", "Lemon"],
    description: "Traditional breaded veal cutlet, fried to golden perfection, served with a slice of lemon.",
    status: "Available",
    chefName: "Franz Weber",
    chefEmail: "franz.weber@example.com",
    chefId: "chef-003",
    chefLocation: "Vienna",
    estimatedDeliveryTime: 35,
    rating: 4.8,
    createdAt: new Date(),
  },
  {
    name: "Spaghetti Carbonara",
    image: "https://i.ibb.co/yn6KWX91/top-view-cheesy-pasta-white-plate.jpg",
    price: 13.5,
    category: "Dinner",
    ingredients: ["Spaghetti", "Eggs", "Pancetta", "Pecorino Romano", "Black pepper"],
    description: "Creamy Roman pasta with crispy pancetta and plenty of Pecorino cheese.",
    status: "Available",
    chefName: "Anna Fischer",
    chefEmail: "anna.fischer@example.com",
    chefId: "chef-004",
    chefLocation: "Hamburg",
    estimatedDeliveryTime: 25,
    rating: 4.6,
    createdAt: new Date(),
  },
  {
    name: "Greek Salad",
    image: "https://i.ibb.co/d08VvZtp/front-view-greek-salad-lettuce-with-black-olives.jpg",
    price: 8.9,
    category: "Snacks",
    ingredients: ["Cucumber", "Tomato", "Feta cheese", "Olives", "Red onion", "Olive oil"],
    description: "Fresh and healthy salad with creamy feta and Kalamata olives.",
    status: "Available",
    chefName: "Petra Hoffmann",
    chefEmail: "petra.hoffmann@example.com",
    chefId: "chef-005",
    chefLocation: "Frankfurt",
    estimatedDeliveryTime: 20,
    rating: 4.5,
    createdAt: new Date(),
  },
  {
    name: "Chicken Caesar Wrap",
    image: "https://i.ibb.co/KjFZd36Y/leanna-myers-JMITde3-Ra-EE-unsplash.jpg",
    price: 10.5,
    category: "Lunch",
    ingredients: ["Grilled chicken", "Romaine lettuce", "Parmesan", "Caesar dressing", "Flour tortilla"],
    description: "Grilled chicken with crisp romaine, parmesan, and creamy Caesar dressing wrapped in a tortilla.",
    status: "Available",
    chefName: "Thomas Wagner",
    chefEmail: "thomas.wagner@example.com",
    chefId: "chef-006",
    chefLocation: "Cologne",
    estimatedDeliveryTime: 25,
    rating: 4.4,
    createdAt: new Date(),
  },
  {
    name: "Beef Stroganoff",
    image: "https://i.ibb.co/zHspJyjt/olivier-amyot-Z49-CUj11-JFk-unsplash.jpg",
    price: 16.5,
    category: "Dinner",
    ingredients: ["Beef strips", "Mushrooms", "Onion", "Sour cream", "Egg noodles"],
    description: "Tender beef in a rich mushroom and sour cream sauce, served over egg noodles.",
    status: "Available",
    chefName: "Helga Klein",
    chefEmail: "helga.klein@example.com",
    chefId: "chef-007",
    chefLocation: "Stuttgart",
    estimatedDeliveryTime: 40,
    rating: 4.7,
    createdAt: new Date(),
  },
  {
    name: "French Onion Soup",
    image: "https://i.ibb.co/fj4GtSp/leila-issa-5-SWenofm-Kk0-unsplash.jpg",
    price: 7.5,
    category: "Snacks",
    ingredients: ["Onions", "Beef broth", "Baguette", "Gruyère cheese"],
    description: "Rich caramelized onion soup topped with toasted baguette and melted Gruyère.",
    status: "Available",
    chefName: "Dieter Zimmermann",
    chefEmail: "dieter.zimmermann@example.com",
    chefId: "chef-008",
    chefLocation: "Düsseldorf",
    estimatedDeliveryTime: 20,
    rating: 4.6,
    createdAt: new Date(),
  },
  {
    name: "Pancakes with Maple Syrup",
    image: "https://i.ibb.co/0j58mrq5/natalia-gusakova-xg-UHBRGTD6w-unsplash-1.jpg",
    price: 6.99,
    category: "Breakfast",
    ingredients: ["Flour", "Milk", "Eggs", "Butter", "Maple syrup"],
    description: "Fluffy homemade pancakes served with warm maple syrup and a pat of butter.",
    status: "Available",
    chefName: "Ursula Richter",
    chefEmail: "ursula.richter@example.com",
    chefId: "chef-009",
    chefLocation: "Bremen",
    estimatedDeliveryTime: 15,
    rating: 4.8,
    createdAt: new Date(),
  },
  {
    name: "Vegetable Lasagna",
    image: "https://i.ibb.co/5g5R2zBp/pexels-daniele-sgura-2571626-4162496.jpg",
    price: 13.9,
    category: "Dinner",
    ingredients: ["Lasagna sheets", "Zucchini", "Spinach", "Ricotta", "Marinara sauce", "Mozzarella"],
    description: "Layers of pasta, fresh vegetables, creamy ricotta, and marinara, topped with mozzarella.",
    status: "Available",
    chefName: "Günter Schäfer",
    chefEmail: "guenter.schaefer@example.com",
    chefId: "chef-010",
    chefLocation: "Leipzig",
    estimatedDeliveryTime: 45,
    rating: 4.5,
    createdAt: new Date(),
  },
  {
    name: "Apple Strudel",
    image: "https://i.ibb.co/TDP3hb9W/pexels-polina-kovaleva-5430680.jpg",
    price: 5.5,
    category: "Dessert",
    ingredients: ["Puff pastry", "Apples", "Cinnamon", "Sugar", "Raisins"],
    description: "Traditional German apple strudel with a flaky crust and spiced apple filling.",
    status: "Available",
    chefName: "Erika Braun",
    chefEmail: "erika.braun@example.com",
    chefId: "chef-011",
    chefLocation: "Dresden",
    estimatedDeliveryTime: 25,
    rating: 4.9,
    createdAt: new Date(),
  },
  {
    name: "Iced Latte",
    image: "https://i.ibb.co/0pCFrv9f/pexels-luana-ribeiro-44057245-22221946.jpg",
    price: 4.5,
    category: "Beverages",
    ingredients: ["Espresso", "Milk", "Ice"],
    description: "Chilled espresso with creamy milk, served over ice.",
    status: "Available",
    chefName: "Markus Wolf",
    chefEmail: "markus.wolf@example.com",
    chefId: "chef-012",
    chefLocation: "Hannover",
    estimatedDeliveryTime: 10,
    rating: 4.3,
    createdAt: new Date(),
  },
];

async function run() {
  if (!uri) {
    console.log("❌ Mongo URI missing. Please set MONGO_URI in .env");
    process.exit(1);
  }

  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");

    const db = client.db("mishown11DB"); // Use your database name
    const mealsCollection = db.collection("meals");

    // 🗑️ Clear existing meals
    const deleteResult = await mealsCollection.deleteMany({});
    console.log(`🗑️ Deleted ${deleteResult.deletedCount} existing meals`);

    // 📦 Insert new meals
    const insertResult = await mealsCollection.insertMany(meals);
    console.log(`✅ Inserted ${insertResult.insertedCount} new meals`);

  } catch (err) {
    console.error("❌ Seed error:", err);
  } finally {
    await client.close();
  }
}

run();