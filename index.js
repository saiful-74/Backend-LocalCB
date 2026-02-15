const express = require('express');
const cors = require('cors');
const cookieParser = require("cookie-parser");
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

// ================= CORS =================
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(null, false);
    },
    credentials: true, // cookie পাঠানোর জন্য বাধ্যতামূলক
  })
);

app.use(cookieParser());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? require("stripe")(stripeKey) : null;

const port = process.env.PORT || 5000;
const uri = process.env.MONGO_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();
    console.log('✅ MongoDB connected successfully!');

    const database = client.db('mishown11DB');
    const userCollection = database.collection('user');
    const mealsCollection = database.collection('meals');
    const reviewsCollection = database.collection('reviews');
    const favoritesCollection = database.collection('favorites');
    const orderCollection = database.collection('order_collection');

    // Helper: convert ObjectId fields to strings for front-end
    const normalizeDoc = (doc) => {
      if (!doc) return doc;
      const copy = { ...doc };
      if (copy._id && copy._id.toString) copy._id = copy._id.toString();
      if (copy.foodId && copy.foodId.toString) copy.foodId = copy.foodId.toString();
      return copy;
    };

    // ================= VERIFY TOKEN MIDDLEWARE =================
    const verifyToken = (req, res, next) => {
      const token = req.cookies?.token;
      if (!token) {
        return res.status(401).send({ message: "Unauthorized access" });
      }
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "Unauthorized access" });
        }
        req.decoded = decoded; // { email }
        next();
      });
    };

    // ================= ROLE-BASED MIDDLEWARES =================
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded?.email;
      const user = await userCollection.findOne({ email });
      if (!user || user.role !== "admin") {
        return res.status(403).send({ message: "Forbidden access" });
      }
      next();
    };

    const verifyChef = async (req, res, next) => {
      const email = req.decoded?.email;
      const user = await userCollection.findOne({ email });
      if (!user || user.role !== "chef") {
        return res.status(403).send({ message: "Forbidden access" });
      }
      next();
    };

    // ================= JWT (LOGIN) – সরল সংস্করণ (ডাটাবেজ চেক ছাড়া) =================
    app.post("/jwt", (req, res) => {
      const user = req.body; // { email: ... }
      if (!user?.email) {
        return res.status(400).send({ message: "email required" });
      }

      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "7d",
      });

      res
        .cookie("token", token, {
          httpOnly: true,
          secure: false,      // localhost এ false
          sameSite: "lax",    // localhost এ lax ok
        })
        .send({ success: true });
    });

    // ================= LOGOUT =================
    app.post("/logout", (req, res) => {
      res
        .clearCookie("token", {
          httpOnly: true,
          secure: false,
          sameSite: "lax",
        })
        .send({ success: true });
    });

    // ================= অন্যান্য রাউটসমূহ =================
    // GET all users – admin only
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const users = await userCollection.find().toArray();
        const normalized = users.map(user => ({
          ...user,
          _id: user._id.toString()
        }));
        res.status(200).json({ success: true, data: normalized });
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
      }
    });

    // GET all admins – admin only (optional, but safe)
    app.get('/users/admins', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const admins = await userCollection
          .find({ role: 'admin' })
          .project({ password: 0 })
          .toArray();
        const normalized = admins.map((a) => ({
          ...a,
          _id: a._id.toString(),
        }));
        res.status(200).json({ success: true, data: normalized });
      } catch (err) {
        console.error('GET /users/admins error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
      }
    });

    // GET all chefs – public
    app.get('/users/chefs', async (req, res) => {
      try {
        const chefs = await userCollection
          .find({ role: 'chef' })
          .project({ password: 0 })
          .toArray();
        const normalized = chefs.map((c) => ({
          ...c,
          _id: c._id.toString(),
        }));
        res.status(200).json({ success: true, data: normalized });
      } catch (err) {
        console.error('GET /users/chefs error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
      }
    });

    // ========== রোল চেক – শুধু নিজের ইমেইল দেখতে পারবে ==========
    // এই রাউটটি /users/:email এর আগে থাকতে হবে
    app.get("/users/role/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.status(403).send({ message: "Forbidden access" });
      }

      const user = await userCollection.findOne(
        { email: email },
        { projection: { role: 1, status: 1, chefId: 1, email: 1, name: 1 } }
      );

      if (!user) {
        return res.status(404).send({ role: "user", status: "active" });
      }

      res.send({
        role: user.role || "user",
        status: user.status || "active",
        chefId: user.chefId || null,
      });
    });

    // GET user by email (own data only)
    app.get('/users/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.status(403).json({ success: false, message: 'Forbidden access' });
      }
      try {
        const user = await userCollection.findOne({ email: email });
        if (user) {
          return res.status(200).json({ success: true, data: user });
        } else {
          return res.status(404).json({ success: false, message: 'User not found' });
        }
      } catch (err) {
        console.error('GET /users/:email error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // PATCH update user status (fraud) – admin only
    app.patch('/users/:id/status', verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;
      if (!['fraud'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }
      try {
        const updatedUser = await userCollection.findOneAndUpdate(
          { _id: new ObjectId(id) },
          { $set: { status } },
          { returnDocument: 'after' }
        );
        if (!updatedUser.value) {
          return res.status(404).json({ success: false, message: 'User not found' });
        }
        res.status(200).json({
          success: true,
          message: 'User marked as fraud',
          data: updatedUser.value,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
      }
    });

    // GET orders by user email (own orders)
    app.get('/orders/:userEmail', verifyToken, async (req, res) => {
      const email = req.params.userEmail;
      if (req.decoded.email !== email) {
        return res.status(403).json({ success: false, message: 'Forbidden access' });
      }
      try {
        const orders = await orderCollection
          .find({ userEmail: email })
          .sort({ orderTime: -1 })
          .toArray();
        const normalizedOrders = orders.map((order) => ({
          ...order,
          _id: order._id.toString(),
          orderTime: order.orderTime ? new Date(order.orderTime).toISOString() : null,
        }));
        res.status(200).json({ success: true, data: normalizedOrders });
      } catch (err) {
        console.error('GET /orders/:userEmail error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // GET user-chef orders (for a chef's meals) – chef himself
    app.get('/user-chef-orders/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.status(403).json({ success: false, message: 'Forbidden access' });
      }
      try {
        const userMeals = await mealsCollection
          .find({ userEmail: email })
          .toArray();
        if (!userMeals.length) {
          return res.status(404).json({ success: false, message: 'No meals found for this user' });
        }
        const chefIds = userMeals.map((meal) => meal.chefId);
        const orders = await orderCollection
          .find({ chefId: { $in: chefIds } })
          .toArray();
        const normalizedOrders = orders.map((order) => ({
          ...order,
          _id: order._id?.toString(),
          foodId: order.foodId?.toString(),
          orderTime: order.orderTime ? new Date(order.orderTime).toISOString() : null,
        }));
        res.status(200).json({ success: true, data: normalizedOrders });
      } catch (err) {
        console.error('GET /user-chef-orders error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // GET chef-id by email (from meals) – chef himself
    app.get('/chef-id/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.status(403).json({ success: false, message: 'Forbidden access' });
      }
      try {
        const meal = await mealsCollection.findOne({ userEmail: email });
        if (!meal) return res.send({ chefId: null });
        res.send({ chefId: meal.chefId || null });
      } catch (err) {
        console.error('GET /chef-id error:', err);
        res.status(500).json({ chefId: null });
      }
    });

    // GET user meals by email (own meals) – chef himself
    app.get('/user-meals/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.status(403).json({ success: false, message: 'Forbidden access' });
      }
      try {
        const meals = await mealsCollection.find({ userEmail: email }).toArray();
        const normalized = meals.map((m) => ({
          ...m,
          _id: m._id?.toString ? m._id.toString() : m._id,
        }));
        res.send({ success: true, data: normalized });
      } catch (error) {
        console.error('GET /user-meals error:', error);
        res.status(500).send({ success: false, message: 'Failed to fetch meals' });
      }
    });

    // GET user reviews by email (own reviews)
    app.get('/user-reviews/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.status(403).json({ success: false, message: 'Forbidden access' });
      }
      try {
        const userReviews = await reviewsCollection
          .find({ reviewerEmail: email })
          .sort({ date: -1 })
          .toArray();
        const normalized = userReviews.map((r) => normalizeDoc(r));
        res.status(200).json({ success: true, data: normalized });
      } catch (err) {
        console.error('GET /user-reviews error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // GET favorites by email (own favorites)
    app.get('/favorites/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.status(403).json({ success: false, message: 'Forbidden access' });
      }
      try {
        const favorites = await favoritesCollection
          .find({ userEmail: email })
          .toArray();
        const normalized = favorites.map((f) => normalizeDoc(f));
        res.status(200).json({ success: true, data: normalized });
      } catch (err) {
        console.error('GET /favorites error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // POST role request (become chef/admin) – নিজের অনুরোধ
    app.post('/role-request', verifyToken, async (req, res) => {
      const { email, requestedRole } = req.body;
      if (req.decoded.email !== email) {
        return res.status(403).json({ success: false, message: 'Forbidden access' });
      }
      if (!['chef', 'admin'].includes(requestedRole)) {
        return res.status(400).json({ success: false, message: 'Invalid role' });
      }
      try {
        const updated = await userCollection.findOneAndUpdate(
          { email },
          { $set: { roleRequest: requestedRole } },
          { returnDocument: 'after' }
        );
        res.status(200).json({
          success: true,
          message: 'Role request submitted',
          data: updated.value,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
      }
    });

    // ================= PUBLIC ROUTES =================
    // Check role by email (used for initial auth check) – public, কিন্তু token চেক করা হয় না
    app.get('/check-role/:email', async (req, res) => {
      const email = req.params.email;
      try {
        const user = await userCollection.findOne({ email });
        if (!user) {
          return res.status(404).json({
            success: false,
            message: 'User not found',
          });
        }
        res.status(200).json({
          success: true,
          email: user.email,
          role: user.role ? user.role.toLowerCase() : 'user',
        });
      } catch (error) {
        console.error('check-role error:', error);
        res.status(500).json({
          success: false,
          message: 'Server error',
        });
      }
    });

    // Users count – public
    app.get('/users/count', async (req, res) => {
      try {
        const totalUsers = await userCollection.estimatedDocumentCount();
        res.json({ success: true, totalUsers });
      } catch (error) {
        console.error(error);
        res.status(500).json({
          success: false,
          message: 'Failed to get total users',
        });
      }
    });

    // Delivered orders count – public
    app.get('/orders/delivered/count', async (req, res) => {
      try {
        const deliveredCount = await orderCollection.countDocuments({
          orderStatus: { $regex: /^delivered$/i },
        });
        res.json({
          success: true,
          deliveredOrders: deliveredCount,
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({
          success: false,
          message: 'Failed to get delivered orders count',
        });
      }
    });

    // Pending payment count – public
    app.get('/orders/pending-payment/count', async (req, res) => {
      try {
        const pendingCount = await orderCollection.countDocuments({
          paymentStatus: { $regex: /^pending$/i },
        });
        res.json({
          success: true,
          pendingPayments: pendingCount,
        });
      } catch (error) {
        console.error(error);
        res.status(500).json({
          success: false,
          message: 'Failed to get pending payment count',
        });
      }
    });

    // Total paid amount – public
    app.get('/orders/paid/total', async (req, res) => {
      try {
        const result = await orderCollection
          .aggregate([
            {
              $match: { paymentStatus: 'paid' },
            },
            {
              $group: {
                _id: null,
                totalPaidAmount: { $sum: '$totalPrice' },
                totalOrders: { $sum: 1 },
              },
            },
          ])
          .toArray();
        res.send(result[0] || { totalPaidAmount: 0, totalOrders: 0 });
      } catch (error) {
        res.status(500).send({ message: 'Server Error' });
      }
    });

    // Stripe checkout session – public
    app.post('/create-checkout-session', async (req, res) => {
      if (!stripe) {
        return res.status(500).json({ error: 'Stripe not configured' });
      }
      const { orderId, amount, email, name } = req.body;
      try {
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          mode: 'payment',
          customer_email: email,
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: {
                  name: name || 'Food Order',
                },
                unit_amount: amount * 100,
              },
              quantity: 1,
            },
          ],
          metadata: {
            orderId,
          },
          success_url: `https://localchefbazaarbyhakimcolor.netlify.app/dashbord/payment-success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `https://localchefbazaarbyhakimcolor.netlify.app/dashbord/payment-cancel`,
        });
        res.json({ url: session.url });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Stripe session error' });
      }
    });

    // Verify payment – public (স্ট্রিপ কলব্যাক)
    app.get('/verify-payment/:sessionId', async (req, res) => {
      if (!stripe) {
        return res.status(500).json({ error: 'Stripe not configured' });
      }
      try {
        const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
        if (session.payment_status === 'paid') {
          const orderId = session.metadata.orderId;
          await orderCollection.updateOne(
            { _id: new ObjectId(orderId) },
            {
              $set: {
                paymentStatus: 'paid',
                paymentInfo: session,
              },
            }
          );
          return res.json({ success: true });
        }
        res.json({ success: false });
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
      }
    });

    // Update order status
    app.patch('/update-order-status/:id', verifyToken, async (req, res) => {
      try {
        const id = req.params.id;
        const { orderStatus } = req.body;
        const validStatus = ['pending', 'cancelled', 'accepted', 'delivered'];
        if (!validStatus.includes(orderStatus)) {
          return res.send({
            success: false,
            message: 'Invalid order status',
          });
        }
        const result = await orderCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { orderStatus } }
        );
        if (result.modifiedCount > 0) {
          return res.send({
            success: true,
            message: `Order ${orderStatus} successfully`,
            result,
          });
        }
        res.send({
          success: false,
          message: 'Order status not updated',
        });
      } catch (error) {
        console.error('Update order status error:', error);
        res.status(500).send({
          success: false,
          message: 'Server error while updating order status',
        });
      }
    });

    // POST update payment status – নিজের অর্ডার
    app.post('/orders/:orderId/pay', verifyToken, async (req, res) => {
      const { orderId } = req.params;
      const { paymentInfo } = req.body;
      try {
        let dbId;
        if (ObjectId.isValid(orderId)) dbId = new ObjectId(orderId);
        else dbId = orderId;
        const updated = await orderCollection.findOneAndUpdate(
          { _id: dbId },
          { $set: { paymentStatus: 'paid', paymentInfo } },
          { returnDocument: 'after' }
        );
        if (!updated.value) {
          return res.status(404).json({ success: false, message: 'Order not found' });
        }
        res.status(200).json({
          success: true,
          message: 'Payment successful',
          order: updated.value,
        });
      } catch (err) {
        console.error('POST /orders/:orderId/pay error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // POST create order – public
    app.post('/orders', async (req, res) => {
      try {
        const orderData = req.body;
        const result = await orderCollection.insertOne(orderData);
        res.send({
          success: true,
          message: 'Order placed successfully!',
          data: result,
        });
      } catch (error) {
        res.status(500).send({
          message: 'Failed to place order',
          error: error.message,
        });
      }
    });

    // PUT update meal – শুধু শেফ
    app.put('/meals/:id', verifyToken, verifyChef, async (req, res) => {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId.trim() : rawId;
      const updateData = req.body;
      try {
        const { _id, ...fieldsToUpdate } = updateData;
        if (fieldsToUpdate.price !== undefined)
          fieldsToUpdate.price = Number(fieldsToUpdate.price);
        if (fieldsToUpdate.rating !== undefined)
          fieldsToUpdate.rating = Number(fieldsToUpdate.rating);
        if (fieldsToUpdate.estimatedDeliveryTime !== undefined)
          fieldsToUpdate.estimatedDeliveryTime = Number(fieldsToUpdate.estimatedDeliveryTime);

        const queries = [];
        if (typeof id === 'string' && ObjectId.isValid(id)) {
          queries.push({ _id: new ObjectId(id) });
        }
        queries.push({ _id: id });
        const matchQuery = queries.length > 1 ? { $or: queries } : queries[0];

        const updatedMeal = await mealsCollection.findOneAndUpdate(
          matchQuery,
          { $set: fieldsToUpdate },
          { returnDocument: 'after' }
        );
        if (!updatedMeal.value) {
          return res.status(404).json({ success: false, message: 'Meal not found' });
        }
        const meal = normalizeDoc(updatedMeal.value);
        res.status(200).json({ success: true, updatedMeal: meal });
      } catch (err) {
        console.error('PUT /meals/:id error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // DELETE meal – শুধু শেফ
    app.delete('/meals/:id', verifyToken, verifyChef, async (req, res) => {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId.trim() : rawId;
      try {
        let result;
        if (typeof id === 'string' && ObjectId.isValid(id)) {
          result = await mealsCollection.deleteOne({ _id: new ObjectId(id) });
        } else {
          result = await mealsCollection.deleteOne({ _id: id });
        }
        if (result.deletedCount === 1) {
          res.status(200).json({ success: true, message: 'Meal deleted successfully' });
        } else {
          res.status(404).json({ success: false, message: 'Meal not found' });
        }
      } catch (error) {
        console.error('DELETE /meals/:id error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // GET latest meals (limit 6) – public
    app.get('/meals/latest', async (req, res) => {
      try {
        const latestMeals = await mealsCollection
          .find()
          .sort({ createdAt: -1 })
          .limit(6)
          .toArray();
        const normalized = latestMeals.map((m) => ({
          ...m,
          _id: m._id.toString(),
        }));
        res.status(200).json({ success: true, data: normalized });
      } catch (err) {
        console.error('GET /meals/latest error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // GET all meals with sorting and status filter – public
    app.get('/meals', async (req, res) => {
      try {
        const sortQuery = req.query.sort; // asc/desc (price)
        const status = req.query.status;  // "Available"
        let sortOption = {};
        let query = {};

        if (status) {
          query.status = { $regex: `^${status}$`, $options: "i" };
        }
        if (sortQuery === 'asc') sortOption = { price: 1 };
        if (sortQuery === 'desc') sortOption = { price: -1 };

        const meals = await mealsCollection.find(query).sort(sortOption).toArray();
        const normalized = meals.map((m) => ({
          ...m,
          _id: m._id.toString(),
        }));
        res.status(200).json({ success: true, data: normalized });
      } catch (err) {
        console.error('GET /meals error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // POST create meal – শুধু শেফ
    app.post('/meals', verifyToken, verifyChef, async (req, res) => {
      const meal = req.body;
      meal.createdAt = new Date();
      try {
        const result = await mealsCollection.insertOne(meal);
        res.status(201).json({
          success: true,
          message: 'Meal added successfully',
          data: { ...meal, _id: result.insertedId.toString() },
        });
      } catch (err) {
        console.error('POST /meals error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // GET single meal by id – public
    app.get('/mealsd/:id', async (req, res) => {
      const id = req.params.id;
      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ success: false, message: 'Invalid Meal ID' });
      }
      try {
        const meal = await mealsCollection.findOne({ _id: new ObjectId(id) });
        if (!meal) {
          return res.status(404).json({ success: false, message: 'Meal not found' });
        }
        meal._id = meal._id.toString();
        res.status(200).json(meal);
      } catch (err) {
        console.error('GET /mealsd error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
      }
    });

    // ================= REVIEWS ROUTES =================
    // GET latest reviews (limit 6) – public
    app.get('/reviews/latest', async (req, res) => {
      try {
        const latestReviews = await reviewsCollection
          .find()
          .sort({ date: -1 })
          .limit(6)
          .toArray();
        const normalized = latestReviews.map((r) => normalizeDoc(r));
        res.status(200).json({ success: true, data: normalized });
      } catch (err) {
        console.error('GET /reviews/latest error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // GET reviews by mealId (path param) – public
    app.get('/reviews/:mealId', async (req, res) => {
      const mealId = req.params.mealId;
      try {
        const reviews = await reviewsCollection
          .find({ foodId: mealId })
          .sort({ date: -1 })
          .toArray();
        const normalized = reviews.map((r) => normalizeDoc(r));
        res.status(200).json({ success: true, data: normalized });
      } catch (err) {
        console.error('GET /reviews/:mealId error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // GET reviews by foodId (query param) – public
    app.get('/reviews', async (req, res) => {
      const { foodId } = req.query;
      if (!foodId) {
        return res.status(400).send({ message: "foodId required" });
      }
      try {
        const reviews = await reviewsCollection
          .find({ foodId })
          .sort({ date: -1 })
          .toArray();
        const normalized = reviews.map((r) => normalizeDoc(r));
        res.send(normalized); // সরাসরি অ্যারে রিটার্ন
      } catch (err) {
        console.error('GET /reviews?foodId error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // POST create review – লগইন যেকোনো ইউজার
    app.post('/reviews', verifyToken, async (req, res) => {
      const review = req.body;

      if (!review.foodId || !review.rating || !review.comment) {
        return res.status(400).send({ message: "foodId, rating, comment required" });
      }

      const doc = {
        foodId: review.foodId,
        reviewerName: review.reviewerName || "Anonymous",
        reviewerImage: review.reviewerImage || "",
        rating: Number(review.rating),
        comment: review.comment,
        reviewerEmail: req.decoded.email,
        date: new Date().toISOString(),
      };

      try {
        const result = await reviewsCollection.insertOne(doc);
        res.send({ insertedId: result.insertedId });
      } catch (err) {
        console.error('POST /reviews error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // PATCH update review – শুধু মালিক
    app.patch('/reviews/:id', verifyToken, async (req, res) => {
      const id = req.params.id;
      const { rating, comment } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid review ID" });
      }

      try {
        const existing = await reviewsCollection.findOne({ _id: new ObjectId(id) });
        if (!existing) {
          return res.status(404).send({ message: "Not found" });
        }

        if (existing.reviewerEmail !== req.decoded.email) {
          return res.status(403).send({ message: "Forbidden" });
        }

        const updateDoc = {
          $set: {
            rating: Number(rating),
            comment,
            date: new Date().toISOString(),
          },
        };

        const result = await reviewsCollection.updateOne(
          { _id: new ObjectId(id) },
          updateDoc
        );

        res.send(result);
      } catch (err) {
        console.error('PATCH /reviews/:id error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // DELETE review – শুধু মালিক
    app.delete('/reviews/:id', verifyToken, async (req, res) => {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId.trim() : rawId;

      try {
        let query;
        if (typeof id === 'string' && ObjectId.isValid(id)) {
          query = { _id: new ObjectId(id) };
        } else {
          query = { _id: id };
        }

        const existing = await reviewsCollection.findOne(query);
        if (!existing) {
          return res.status(404).send({ message: "Not found" });
        }

        if (existing.reviewerEmail !== req.decoded.email) {
          return res.status(403).send({ message: "Forbidden" });
        }

        const result = await reviewsCollection.deleteOne(query);
        res.send(result);
      } catch (err) {
        console.error('DELETE /reviews error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // ================= FAVORITES ROUTES (UPDATED) =================

    // ✅ A) Add to favorites (duplicate check সহ)
    app.post("/favorites", verifyToken, async (req, res) => {
      const data = req.body;

      if (!data?.mealId || !data?.mealName) {
        return res.status(400).send({ message: "mealId & mealName required" });
      }

      const userEmail = req.decoded.email;

      // ✅ duplicate block
      const exists = await favoritesCollection.findOne({ userEmail, mealId: data.mealId });
      if (exists) {
        return res.send({ insertedId: null, message: "Already in favorites" });
      }

      const doc = {
        userEmail,
        mealId: data.mealId,
        mealName: data.mealName,
        chefId: data.chefId || "",
        chefName: data.chefName || "",
        price: data.price || "",
        addedTime: new Date().toISOString(),
      };

      const result = await favoritesCollection.insertOne(doc);
      res.send({ insertedId: result.insertedId });
    });

    // ✅ B) Get my favorites (secure) – replaces the old GET /my-favorites
    app.get("/my-favorites", verifyToken, async (req, res) => {
      const userEmail = req.decoded.email;
      const favs = await favoritesCollection.find({ userEmail }).sort({ addedTime: -1 }).toArray();
      res.send(favs);
    });

    // ✅ C) Delete favorite
    app.delete("/favorites/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const email = req.decoded.email;

      const fav = await favoritesCollection.findOne({ _id: new ObjectId(id) });
      if (!fav) return res.status(404).send({ message: "Not found" });

      if (fav.userEmail !== email) return res.status(403).send({ message: "Forbidden" });

      const result = await favoritesCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // ================= ROLE REQUESTS =================
    // GET role requests – admin only
    app.get('/role-requests', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const requests = await userCollection
          .find({ roleRequest: { $exists: true } })
          .toArray();
        res.status(200).json({ success: true, data: requests });
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
      }
    });

    // PATCH approve role request – admin only
    app.patch('/role-requests/:id/approve', verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      try {
        const user = await userCollection.findOne({ _id: new ObjectId(id) });
        if (!user || !user.roleRequest) {
          return res.status(404).json({ success: false, message: 'No pending request' });
        }
        const updated = await userCollection.findOneAndUpdate(
          { _id: new ObjectId(id) },
          { $set: { role: user.roleRequest }, $unset: { roleRequest: '' } },
          { returnDocument: 'after' }
        );
        res.status(200).json({
          success: true,
          message: 'Role updated successfully',
          data: updated.value,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
      }
    });

    // PATCH decline role request – admin only
    app.patch('/role-requests/:id/decline', verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      try {
        const updated = await userCollection.findOneAndUpdate(
          { _id: new ObjectId(id) },
          { $unset: { roleRequest: '' } },
          { returnDocument: 'after' }
        );
        res.status(200).json({
          success: true,
          message: 'Role request declined',
          data: updated.value,
        });
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
      }
    });

    // POST create user (registration) – public
    app.post('/users', async (req, res) => {
      const userInfo = req.body;
      userInfo.role = 'user';
      userInfo.createdAt = new Date();
      try {
        const result = await userCollection.insertOne(userInfo);
        res.status(201).json({
          success: true,
          data: {
            ...userInfo,
            _id: result.insertedId?.toString?.() || result.insertedId,
          },
        });
      } catch (err) {
        console.error('POST /users error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // GET stats – public
    app.get('/api/stats', async (req, res) => {
      try {
        const mealsCount = await mealsCollection.countDocuments();
        const reviewsCount = await reviewsCollection.countDocuments();
        const favoritesCount = await favoritesCollection.countDocuments();
        res.json({ success: true, mealsCount, reviewsCount, favoritesCount });
      } catch (error) {
        console.error('GET /api/stats error:', error);
        res.status(500).json({ success: false, message: 'Server Error' });
      }
    });

    // Test route
    app.get('/', (req, res) => {
      res.send('Hello World from Express + MongoDB!');
    });

    // ================= MY DASHBOARD ROUTES =================

    // ✅ My Orders
    app.get('/my-orders', verifyToken, async (req, res) => {
      try {
        const email = req.decoded.email;

        const orders = await orderCollection
          .find({ userEmail: email })
          .sort({ createdAt: -1 })
          .toArray();

        res.send({ success: true, data: orders });
      } catch (err) {
        console.error('GET /my-orders error:', err);
        res.status(500).json({ success: false, message: err.message });
      }
    });

    // ✅ My Favorites – already replaced above, but we keep the comment for clarity
    // (the actual route is the one above)

    // ✅ My Reviews
    app.get('/my-reviews', verifyToken, async (req, res) => {
      try {
        const email = req.decoded.email;

        const reviews = await reviewsCollection
          .find({ reviewerEmail: email })
          .sort({ date: -1 })
          .toArray();

        res.send({ success: true, data: reviews });
      } catch (err) {
        console.error('GET /my-reviews error:', err);
        res.status(500).json({ success: false, message: err.message });
      }
    });

    // ================= 404 Fallback (অজানা রুটের জন্য) =================
    app.use((req, res) => {
      res.status(404).json({ message: "Route not found" });
    });

  } finally {
    // Do not close the connection
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});