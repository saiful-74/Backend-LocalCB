const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;
const app = express();

app.use(cors());
app.use(express.json());

const uri =
  'mongodb+srv://mishown11DB:XHDeaNzb40GmoGuC@cluster0.5xthpnl.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

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
    // Helper: normalize ObjectId fields to strings for front-end consistency
    const normalizeDoc = (doc) => {
      if (!doc) return doc;
      const copy = { ...doc };
      if (copy._id && copy._id.toString) copy._id = copy._id.toString();
      if (copy.foodId && copy.foodId.toString)
        copy.foodId = copy.foodId.toString();
      return copy;
    };
    // GET all users with role 'admin'
    app.get('/users/admins', async (req, res) => {
      try {
        const admins = await userCollection
          .find({ role: 'admin' })
          .project({ password: 0 }) // hide password
          .toArray();

        // normalize _id for frontend
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

    // GET all users with role 'chef'
    app.get('/users/chefs', async (req, res) => {
      try {
        const chefs = await userCollection
          .find({ role: 'chef' })
          .project({ password: 0 }) // hide password
          .toArray();

        // normalize _id for frontend
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

    // GET: Check user role by email

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

    //  Platform Statistics Page (Private)
    // Delivered Orders Count API
    app.get('/orders/delivered/count', async (req, res) => {
      try {
        const deliveredCount = await orderCollection.countDocuments({
          orderStatus: { $regex: /^delivered$/i }, // case-insensitive
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

    // Pending Payment Count API
    app.get('/orders/pending-payment/count', async (req, res) => {
      try {
        const pendingCount = await orderCollection.countDocuments({
          paymentStatus: { $regex: /^pending$/i }, // case-insensitive
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

    // Total Users Count API
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

    // total payment
    app.get('/orders/paid/total', async (req, res) => {
      try {
        const orderCollection = database.collection('order_collection');

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

    // Create Checkout Session

    app.post('/create-checkout-session', async (req, res) => {
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

    // Verify Payment
    // app.get('/verify-payment/:sessionId', async (req, res) => {
    //   const { sessionId } = req.params;
    //   try {
    //     const session = await stripe.checkout.sessions.retrieve(sessionId);
    //     if (session.payment_status === 'paid') {
    //       const orderId = session.metadata.orderId;
    //       await orderCollection.updateOne(
    //         { _id: new ObjectId(orderId) },
    //         { $set: { paymentStatus: 'paid', paymentInfo: session } }
    //       );
    //       res.json({ success: true });
    //     } else {
    //       res.json({ success: false });
    //     }
    //   } catch (err) {
    //     console.error('Verify payment error:', err);
    //     res.status(500).json({ success: false, message: err.message });
    //   }
    // });
    app.get('/verify-payment/:sessionId', async (req, res) => {
      try {
        const session = await stripe.checkout.sessions.retrieve(
          req.params.sessionId
        );

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

    // PATCH /users/fraud/:id
    //PATCH /users/:id/status
    app.patch('/users/:id/status', async (req, res) => {
      const { id } = req.params;
      const { status } = req.body; // expected: 'fraud'

      if (!['fraud'].includes(status)) {
        return res
          .status(400)
          .json({ success: false, message: 'Invalid status' });
      }

      try {
        const updatedUser = await userCollection.findOneAndUpdate(
          { _id: new ObjectId(id) },
          { $set: { status } },
          { returnDocument: 'after' }
        );

        if (!updatedUser.value) {
          return res
            .status(404)
            .json({ success: false, message: 'User not found' });
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

    // GET /users
    app.get('/users', async (req, res) => {
      try {
        const users = await userCollection.find().toArray();
        res.status(200).json({ success: true, data: users });
      } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
      }
    });

    // -------------------------------
    // Update Order Status (Cancel / Accept / Deliver)
    // -------------------------------
    app.patch('/update-order-status/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const { orderStatus } = req.body;

        // Check if valid status
        const validStatus = ['pending', 'cancelled', 'accepted', 'delivered'];
        if (!validStatus.includes(orderStatus)) {
          return res.send({
            success: false,
            message: 'Invalid order status',
          });
        }

        // Update order
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

    //.....................oreder her..............
    // Orders API
    // GET: Orders of logged-in user
    app.get('/orders/:userEmail', async (req, res) => {
      const email = req.params.userEmail;

      try {
        const orders = await orderCollection
          .find({ userEmail: email })
          .sort({ orderTime: -1 })
          .toArray();

        // Normalize _id and dates
        const normalizedOrders = orders.map((order) => ({
          ...order,
          _id: order._id.toString(),
          orderTime: order.orderTime
            ? new Date(order.orderTime).toISOString()
            : null,
        }));

        res.status(200).json({ success: true, data: normalizedOrders });
      } catch (err) {
        console.error('GET /orders/:userEmail error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // POST: Update Payment Status after successful Stripe Payment
    app.post('/orders/:orderId/pay', async (req, res) => {
      const { orderId } = req.params;
      const { paymentInfo } = req.body; // payment details from Stripe

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
          return res
            .status(404)
            .json({ success: false, message: 'Order not found' });
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

    // GET: Orders where user's meals match chefId in orders

    app.get('/user-chef-orders/:email', async (req, res) => {
      const email = req.params.email;

      try {
        const userMeals = await mealsCollection
          .find({ userEmail: email })
          .toArray();

        if (!userMeals.length) {
          return res
            .status(404)
            .json({ success: false, message: 'No meals found for this user' });
        }

        const chefIds = userMeals.map((meal) => meal.chefId);

        const orders = await orderCollection
          .find({ chefId: { $in: chefIds } })
          .toArray();

        const normalizedOrders = orders.map((order) => ({
          ...order,
          _id: order._id?.toString(),
          foodId: order.foodId?.toString(),
          orderTime: order.orderTime
            ? new Date(order.orderTime).toISOString()
            : null,
        }));

        res.status(200).json({ success: true, data: normalizedOrders });
      } catch (err) {
        console.error('GET /user-chef-orders error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // POST: Create Order
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

    // ------------------ Meals ------------------

    //chefId API  when the user role is chef ......

    app.get('/chef-id/:email', async (req, res) => {
      const email = req.params.email;

      try {
        // Meals collection এ chef-এর email field হয় userEmail
        const meal = await mealsCollection.findOne({ userEmail: email });
        if (!meal) return res.send({ chefId: null });

        res.send({ chefId: meal.chefId || null });
      } catch (err) {
        console.error('GET /chef-id error:', err);
        res.status(500).json({ chefId: null });
      }
    });

    app.put('/meals/:id', async (req, res) => {
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
          fieldsToUpdate.estimatedDeliveryTime = Number(
            fieldsToUpdate.estimatedDeliveryTime
          );

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
          return res
            .status(404)
            .json({ success: false, message: 'Meal not found' });
        }

        const meal = normalizeDoc(updatedMeal.value);
        res.status(200).json({ success: true, updatedMeal: meal });
      } catch (err) {
        console.error('PUT /meals/:id error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    app.delete('/meals/:id', async (req, res) => {
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
          res
            .status(200)
            .json({ success: true, message: 'Meal deleted successfully' });
        } else {
          res.status(404).json({ success: false, message: 'Meal not found' });
        }
      } catch (error) {
        console.error('DELETE /meals/:id error:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    app.get('/user-meals/:email', async (req, res) => {
      const email = req.params.email;

      try {
        const meals = await mealsCollection
          .find({ userEmail: email })
          .toArray();
        const normalized = meals.map((m) => ({
          ...m,
          _id: m._id?.toString ? m._id.toString() : m._id,
        }));
        res.send({ success: true, data: normalized });
      } catch (error) {
        console.error('GET /user-meals error:', error);
        res
          .status(500)
          .send({ success: false, message: 'Failed to fetch meals' });
      }
    });

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

    app.get('/meals', async (req, res) => {
      try {
        const sortQuery = req.query.sort;
        let sortOption = {};

        if (sortQuery === 'asc') {
          sortOption = { price: 1 };
        } else if (sortQuery === 'desc') {
          sortOption = { price: -1 };
        }

        const meals = await mealsCollection.find().sort(sortOption).toArray();
        const normalized = meals.map((m) => ({ ...m, _id: m._id.toString() }));
        res.status(200).json({ success: true, data: normalized });
      } catch (err) {
        console.error('GET /meals error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    app.post('/meals', async (req, res) => {
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

    app.get('/mealsd/:id', async (req, res) => {
      const id = req.params.id;

      if (!ObjectId.isValid(id)) {
        return res
          .status(400)
          .json({ success: false, message: 'Invalid Meal ID' });
      }

      try {
        const meal = await mealsCollection.findOne({ _id: new ObjectId(id) });

        if (!meal) {
          return res
            .status(404)
            .json({ success: false, message: 'Meal not found' });
        }

        meal._id = meal._id.toString();
        res.status(200).json(meal);
      } catch (err) {
        console.error('GET /mealsd error:', err);
        res.status(500).json({ success: false, message: 'Server error' });
      }
    });

    // ------------------ Reviews ------------------

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

    app.post('/reviews', async (req, res) => {
      const review = req.body;

      try {
        const result = await reviewsCollection.insertOne(review);
        res.status(201).json({
          success: true,
          data: { ...review, _id: result.insertedId.toString() },
        });
      } catch (err) {
        console.error('POST /reviews error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // PATCH /reviewsup/:id — robust: match by ObjectId or string, then update using actual DB _id

    app.patch('/reviewsup/:id', async (req, res) => {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId.trim() : rawId;
      const { rating, comment } = req.body;

      try {
        const updates = {};
        if (rating !== undefined) updates.rating = Number(rating);
        if (comment !== undefined) updates.comment = comment;

        const queries = [];
        if (typeof id === 'string' && ObjectId.isValid(id)) {
          queries.push({ _id: new ObjectId(id) });
        }
        queries.push({ _id: id });
        const matchQuery = queries.length > 1 ? { $or: queries } : queries[0];

        const found = await reviewsCollection.findOne(matchQuery);
        if (!found) {
          return res
            .status(404)
            .json({ success: false, message: 'Review not found' });
        }

        const dbId = found._id;
        const updated = await reviewsCollection.findOneAndUpdate(
          { _id: dbId },
          { $set: updates },
          { returnDocument: 'after' }
        );

        if (!updated.value) {
          return res
            .status(500)
            .json({ success: false, message: 'Update failed' });
        }

        const review = normalizeDoc(updated.value);
        res.status(200).json({ success: true, updatedReview: review });
      } catch (err) {
        console.error('PATCH /reviewsup error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    app.delete('/reviews/:id', async (req, res) => {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId.trim() : rawId;

      try {
        let result;
        if (typeof id === 'string' && ObjectId.isValid(id)) {
          result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
        } else {
          result = await reviewsCollection.deleteOne({ _id: id });
        }

        if (result.deletedCount === 1) {
          res
            .status(200)
            .json({ success: true, message: 'Review deleted successfully' });
        } else {
          res.status(404).json({ success: false, message: 'Review not found' });
        }
      } catch (err) {
        console.error('DELETE /reviews error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    app.get('/user-reviews/:email', async (req, res) => {
      const email = req.params.email;
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

    // ------------------ Favorites ------------------

    app.post('/favorites', async (req, res) => {
      const favoriteMeal = req.body;

      try {
        const exists = await favoritesCollection.findOne({
          userEmail: favoriteMeal.userEmail,
          mealId: favoriteMeal.mealId,
        });
        if (exists) {
          return res
            .status(400)
            .json({ success: false, message: 'Meal already in favorites' });
        }

        const result = await favoritesCollection.insertOne(favoriteMeal);
        res.status(201).json({
          success: true,
          data: { ...favoriteMeal, _id: result.insertedId.toString() },
        });
      } catch (err) {
        console.error('POST /favorites error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    app.get('/favorites/:email', async (req, res) => {
      const email = req.params.email;
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

    app.delete('/favorites/:id', async (req, res) => {
      const rawId = req.params.id;
      const id = typeof rawId === 'string' ? rawId.trim() : rawId;

      try {
        let result;
        if (typeof id === 'string' && ObjectId.isValid(id)) {
          result = await favoritesCollection.deleteOne({
            _id: new ObjectId(id),
          });
        } else {
          result = await favoritesCollection.deleteOne({ _id: id });
        }

        if (result.deletedCount > 0) {
          res.status(200).json({ success: true, message: 'Favorite removed' });
        } else {
          res
            .status(404)
            .json({ success: false, message: 'Favorite not found' });
        }
      } catch (err) {
        console.error('DELETE /favorites error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // ------------------ Users ------------------

    app.post('/role-request', async (req, res) => {
      const { email, requestedRole } = req.body;
      if (!['chef', 'admin'].includes(requestedRole))
        return res
          .status(400)
          .json({ success: false, message: 'Invalid role' });

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
    app.get('/role-requests', async (req, res) => {
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
    app.patch('/role-requests/:id/approve', async (req, res) => {
      const { id } = req.params;

      try {
        const user = await userCollection.findOne({ _id: new ObjectId(id) });
        if (!user || !user.roleRequest)
          return res
            .status(404)
            .json({ success: false, message: 'No pending request' });

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

    app.patch('/role-requests/:id/decline', async (req, res) => {
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

    // email user
    app.get('/users/:email', async (req, res) => {
      const email = req.params.email;
      try {
        const user = await userCollection.findOne({ email: email });
        if (user) {
          return res.status(200).json({ success: true, data: user });
        } else {
          return res
            .status(404)
            .json({ success: false, message: 'User not found' });
        }
      } catch (err) {
        console.error('GET /users/:email error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });
    // aaaaaaaaaaaaa
    app.get('/users/role/:email', async (req, res) => {
      const email = req.params.email;
      try {
        const user = await userCollection.findOne({ email: email });
        if (user) {
          return res.status(200).json({ success: true, role: user.role });
        } else {
          return res
            .status(404)
            .json({ success: false, message: 'User not found' });
        }
      } catch (err) {
        console.error('GET /users/role/:email error:', err);
        res.status(500).json({ success: false, error: err.message });
      }
    });

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

    // ------------------ Stats ------------------

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
  } finally {
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
