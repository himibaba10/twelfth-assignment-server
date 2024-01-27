const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const PORT = process.env.PORT || 5000;
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const capitalize = require("./lib/capitalize");

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Custom middlewares
const verifyUser = (req, res, next) => {
  const token = req.headers.token;
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    req.decodedUser = decoded;
    next();
  });
};

const verifyAdmin = (req, res, next) => {
  const role = req.decodedUser.role;
  if (role !== "admin") {
    return res.status(403).json({ message: "Forbidden" });
  }

  next();
};

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
``;
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.gadig.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    // Collections
    const contestCollection = client
      .db("contestBeatersDB")
      .collection("contests");

    const userCollection = client.db("contestBeatersDB").collection("users");

    const registrationCollection = client
      .db("contestBeatersDB")
      .collection("registrations");

    /**
     * --------------------------------
     *      JWT related APIs
     * --------------------------------
     */

    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: "1h" });
      res.send({ token });
    });

    /**
     * --------------------------------
     *      Payment related APIs
     * --------------------------------
     */

    app.post("/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: parseInt(price * 100),
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    /**
     * --------------------------------
     *      Contest related APIs
     * --------------------------------
     */

    // Get all the contests
    app.get("/contests", verifyUser, verifyAdmin, async (req, res) => {
      const result = await contestCollection.find().toArray();
      res.send(result);
    });

    // Get contests in descending order
    app.get("/contests/popular", async (req, res) => {
      const result = await contestCollection
        .find()
        .sort({ participants: -1 })
        .limit(5)
        .toArray();
      res.send(result);
    });

    // Get contests based on search
    app.get("/contests/search/:search", async (req, res) => {
      const search = req.params.search;
      console.log(capitalize(search));
      const result = await contestCollection
        .find({ type: capitalize(search) })
        .toArray();
      res.send(result);
    });

    // Get accepted contests
    app.get("/contests/accepted/:type", async (req, res) => {
      let type = req.params.type;

      const query = { status: "accepted" };

      if (type !== "All") {
        query.type = type;
      }

      console.log(type);
      const result = await contestCollection.find(query).toArray();
      res.send(result);
    });

    // Add a contest
    app.post("/add-contest", async (req, res) => {
      const contest = req.body;
      const result = await contestCollection.insertOne(contest);
      res.send(result);
    });

    // Get contests based on user email
    app.get("/contests/:email", verifyUser, async (req, res) => {
      const email = req.params.email;

      if (req.params.email !== req.decodedUser.email) {
        return res.status(401).send({ message: "Forbidden" });
      }

      const result = await contestCollection.find({ email }).toArray();
      res.send(result);
    });

    // Get registered contests based on user email
    app.get("/registered-contests/:email", verifyUser, async (req, res) => {
      const email = req.params.email;
      const sort = req.query.sort;
      const result = await registrationCollection.find({ email }).toArray();
      if (sort === "true") {
        const sortedResult = result.sort(
          (a, b) => new Date(b.deadline) - new Date(a.deadline)
        );
        res.send(sortedResult);
        return;
      }
      res.send(result);
    });

    // Get a contest based on id
    app.get("/get-contest/:id", async (req, res) => {
      const id = req.params.id;
      const result = await contestCollection.findOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // Delete a contest based on id
    app.delete("/contest/delete/:id", async (req, res) => {
      const id = req.params.id;
      const result = await contestCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // Update a contest based on id
    app.put("/contest/update/:id", async (req, res) => {
      const id = req.params.id;
      const contest = req.body;

      const result = await contestCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: contest }
      );

      res.send(result);
    });

    // Update status of a contest
    app.patch("/contest/update-status/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: "accepted",
        },
      };
      const result = await contestCollection.updateOne(query, updatedDoc);
      res.send(result);
    });

    // Update status of a registered contest
    app.patch("/registered-contest/update-status/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          participated: true,
        },
      };
      const result = await registrationCollection.updateOne(query, updatedDoc);
      res.send(result);
    });

    // Make winner for the contest
    app.patch("/contest/winner", async (req, res) => {
      const { contestId, userId } = req.body;

      const contestQuery = {
        _id: new ObjectId(contestId),
      };

      const userQuery = {
        _id: new ObjectId(userId),
      };

      const contest = await contestCollection.findOne(contestQuery);

      if (contest.winner) {
        return res.send({ status: "failure" });
      }

      const updatedDoc = {
        $set: {
          winner: userId,
        },
      };

      const result = await contestCollection.updateOne(
        contestQuery,
        updatedDoc
      );
      if (result.modifiedCount > 0) {
        const result = await registrationCollection.updateOne(
          userQuery,
          {
            $set: {
              winner: true,
            },
          },
          { upsert: true }
        );

        if (result.modifiedCount > 0) {
          res.send({ status: "success" });
        }
      }
    });

    // Get winner for the contest based on the email
    app.get("/winning-contests/:email", verifyUser, async (req, res) => {
      const email = req.params.email;
      const query = { email, winner: true };
      const result = await registrationCollection.find(query).toArray();
      res.send(result);
    });

    /**
     * --------------------------------
     *      User related APIs
     * --------------------------------
     */

    // Get all users
    app.get("/users/:email", verifyUser, verifyAdmin, async (req, res) => {
      const email = req?.params?.email;
      const query = {
        email: {
          $nin: [email],
        },
      };
      const result = await userCollection.find(query).toArray();
      res.send(result);
    });

    // Get creators
    app.get("/creators", async (req, res) => {
      const query = {
        role: "creator",
      };
      const result = await userCollection.find(query).toArray();
      res.send(result);
    });

    // Add a user to database
    app.post("/add-user", async (req, res) => {
      const user = req.body;

      const query = {
        email: user.email,
      };

      const userFound = await userCollection.findOne(query);
      if (userFound) {
        res.send(userFound);
        return;
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // Getting role of a user
    app.get("/user-role", async (req, res) => {
      const email = req.query.email;
      const result = await userCollection.findOne({ email });
      if (!result) {
        res.send({ role: "user" });
        return;
      }
      res.send({ role: result.role });
    });

    // Updating role of a user
    app.patch(
      "/user/update-role/:id",
      verifyUser,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const role = req.body.role;
        const query = {
          _id: new ObjectId(id),
        };
        const updatedDoc = {
          $set: {
            role,
          },
        };

        const result = await userCollection.updateOne(query, updatedDoc);
        res.send(result);
      }
    );

    // Updating user info
    app.patch("/user/update/:email", verifyUser, async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const query = {
        email,
      };
      const updatedDoc = {
        $set: {
          name: user.name,
          image: user.image,
        },
      };

      const result = await userCollection.updateOne(query, updatedDoc);
      res.send(result);
    });

    /**
     * --------------------------------
     *      Registrations related APIs
     * --------------------------------
     */

    // Register a contest
    app.post("/register", async (req, res) => {
      const { contestId, name, email, contest, contestOwner, deadline } =
        req.body;

      const result = await registrationCollection.insertOne({
        contestId,
        name,
        email,
        contest,
        contestOwner,
        deadline,
      });

      if (result.insertedId) {
        const query = { _id: new ObjectId(contestId) };
        const updatedDoc = {
          $inc: {
            participants: 1,
          },
        };

        const result = await contestCollection.updateOne(query, updatedDoc);
        res.send(result);
      }
    });

    // Get registered contests based on creator email
    app.get("/registrations/:email", async (req, res) => {
      const email = req.params.email;
      const result = await registrationCollection
        .find({ contestOwner: email })
        .toArray();

      res.send(result);
    });
  } catch (err) {
    console.log(
      `There was an error connecting to MongoDB with status code ${err.code}`,
      err.message
    );
  }
}
run();

app.get("/", (req, res) => {
  res.send("Contest beaters server is running");
});

app.listen(PORT, () => {
  console.log(`listening on ${PORT}`);
});
