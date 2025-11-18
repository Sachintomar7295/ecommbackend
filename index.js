
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const { useState } = require('react');

const app = express();
app.use(cors());
app.use(express.json());
//added
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const secretKey = "your-secret-key"; // use .env in production



// ✅ MySQL Connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'ecommerce',
  port: 3307,
});

db.connect((err) => {
  if (err) {
    console.error('❌ MySQL connection failed:', err.message);
    process.exit(1);
  }
  console.log('✅ MySQL connected');
});

// ✅ Create uploads directory if not exist
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// ✅ Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// ✅ Serve static images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ Nodemailer setup
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'tomarsachin7295@gmail.com',
    pass: 'huvp oyqb sarl lsyr', // ✅ Gmail App Password
  },
});

// ✅ Add Product
app.post('/api/products', upload.single('image'), (req, res) => {
  const { name, description, price, category } = req.body;
  const image = req.file ? req.file.filename : null;

  // category को अब ज़रूरी नहीं माना जा रहा
  if (!name || !description || !price) {
    return res.status(400).json({ error: 'Name, description, and price are required.' });
  }

  const sql = 'INSERT INTO products (name, description, price, category, image) VALUES (?, ?, ?, ?, ?)';
  db.query(sql, [name, description, price, category || null, image], (err, result) => {
    console.log("kamlllllll",sql);
    if (err) {
      console.error('Product insert error:', err);
      return res.status(500).json({ error: 'Failed to insert product' });
    }

    res.status(201).json({ message: 'Product added', productId: result.insertId });
  });
});


// ✅ Get All Products with Search, Category, Price Filter
app.get('/api/products', (req, res) => {
  const { search = '', category = '', min = 0, max = 100000 } = req.query;

  let sql = 'SELECT * FROM products WHERE 1=1';
  const values = [];

  if (search) {
    sql += ' AND name LIKE ?';
    values.push(`%${search}%`);
  }

  if (category) {
    sql += ' AND category = ?';
    values.push(category);
  }

  sql += ' AND price BETWEEN ? AND ?';
  values.push(Number(min), Number(max));

  sql += ' ORDER BY id DESC';

  db.query(sql, values, (err, results) => {
    if (err) {
      console.error('Fetch error:', err);
      return res.status(500).json({ error: 'Failed to fetch products' });
    }

    res.json(results);
  });
});

// ✅ Get Single Product
app.get('/api/products/:id', (req, res) => {
  const { id } = req.params;
  const sql = 'SELECT * FROM products WHERE id = ?';

  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error('Product fetch error:', err);
      return res.status(500).json({ error: 'Failed to fetch product' });
    }

    if (result.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const product = result[0];
    product.name = product.name?.toString().trim().replace(/^"+|"+$/g, '');
    product.description = product.description?.toString().trim().replace(/^"+|"+$/g, '');
    product.image = product.image?.toString().trim().replace(/\r?\n|\r/g, '');

    res.json(product);
  });
});

// ✅ Product View Notification
app.post('/api/product/view', (req, res) => {
  const { name, email, phone, productName } = req.body;

  if (!name || !email || !phone || !productName) {
    return res.status(400).json({ error: 'Name, email, phone, and product name are required' });
  }

  const adminMail = {
    from: 'tomarsachin7295@gmail.com',
    to: 'tomarsachin7295@gmail.com',
    subject: `👁️ Product Viewed: ${productName}`,
    html: `
      <h3>📌 Product Viewed</h3>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Phone:</strong> ${phone}</p>
      <p><strong>Product:</strong> ${productName}</p>
    `
  };

  const userMail = {
    from: 'tomarsachin7295@gmail.com',
    to: email,
    subject: `✅ Thanks for viewing ${productName}`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 10px;">
        <img src="https://i.imgur.com/QZDCQqd.png" alt="Logo" width="100" />
        <h2>Hi ${name},</h2>
        <p>Thanks for checking out our product: <strong>${productName}</strong>.</p>
        <p>We appreciate your interest and will get in touch soon if needed.</p>
        <p>Feel free to contact us at any time!</p>
        <br />
        <p>📞 Contact: 07830648340</p>
        <p>🌐 Visit us again soon!</p>
      </div>
    `
  };

  transporter.sendMail(adminMail, (adminErr) => {
    if (adminErr) {
      console.error('❌ Admin email error:', adminErr);
      return res.status(500).json({ error: 'Admin email failed' });
    }

    transporter.sendMail(userMail, (userErr) => {
      if (userErr) {
        console.error('❌ User email error:', userErr);
        return res.status(500).json({ error: 'User email failed' });
      }

      res.json({ message: 'Emails sent to admin and user' });
    });
  });
});

// ✅ Place Order
app.post('/api/orders', (req, res) => {
  const { fullName, email, address, city, state, zipCode, items } = req.body;

  if (!fullName || !email || !address || !city || !state || !zipCode || !items?.length) {
    return res.status(400).json({ error: 'All fields and at least one item are required.' });
  }

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  db.beginTransaction((err) => {
    if (err) return res.status(500).json({ error: 'Database error' });

    const orderSql =
      'INSERT INTO orders (fullName, email, address, city, state, zipCode, total) VALUES (?, ?, ?, ?, ?, ?, ?)';

    db.query(orderSql, [fullName, email, address, city, state, zipCode, total], (err, orderResult) => {
      if (err) return db.rollback(() => res.status(500).json({ error: 'Failed to save order' }));

      const orderId = orderResult.insertId;
      const orderItemsValues = items.map(item => [
        orderId,
        item.id,
        item.name,
        item.quantity,
        item.price
      ]);

      const orderItemsSql =
        'INSERT INTO order_items (order_id, product_id, product_name, quantity, price) VALUES ?';

      db.query(orderItemsSql, [orderItemsValues], (err) => {
        if (err) return db.rollback(() => res.status(500).json({ error: 'Failed to save order items' }));

        db.commit(err => {
          if (err) return db.rollback(() => res.status(500).json({ error: 'Transaction failed' }));

          const mailOptions = {
            from: 'tomarsachin7295@gmail.com',
            to: 'tomarsachin7295@gmail.com',
            subject: `🛒 New Order from ${fullName}`,
            text: `New order placed by ${fullName} (${email}) with ${items.length} items.`,
          };

          transporter.sendMail(mailOptions, (err) => {
            if (err) console.error('❌ Order email error:', err);
            res.json({ message: 'Order saved successfully', orderId });
          });
        });
      });
    });
  });
});

// ✅ Get All Orders (User)
app.get('/api/orders', (req, res) => {
  const sql = `
    SELECT 
      o.id AS order_id,
      o.fullName,
      o.email,
      o.address,
      o.city,
      o.state,
      o.zipCode,
      o.total,
      o.created_at,
      oi.product_name,
      oi.quantity,
      oi.price
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    ORDER BY o.created_at DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('Fetch orders error:', err);
      return res.status(500).json({ error: 'Failed to fetch orders' });
    }

    const grouped = results.reduce((acc, row) => {
      const { order_id, product_name, quantity, price, ...orderInfo } = row;
      if (!acc[order_id]) {
        acc[order_id] = { ...orderInfo, order_id, items: [] };
      }
      acc[order_id].items.push({ product_name, quantity, price });
      return acc;
    }, {});

    res.json(Object.values(grouped));
  });
});

// ✅ Admin Orders
app.get('/api/admin/orders', (req, res) => {
  const sql = `
    SELECT 
      o.id AS order_id,
      o.fullName AS user_name,
      o.email,
      o.address AS shipping_address,
      o.created_at,
      oi.product_name,
      oi.quantity,
      oi.price
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    ORDER BY o.created_at DESC
  `;

  db.query(sql, (err, results) => {
    if (err) {
      console.error('Admin orders fetch error:', err);
      return res.status(500).json({ error: 'Orders fetch failed' });
    }

    const grouped = results.reduce((acc, row) => {
      const { order_id, product_name, quantity, price, ...orderInfo } = row;
      if (!acc[order_id]) {
        acc[order_id] = { ...orderInfo, id: order_id, items: [] };
      }
      acc[order_id].items.push({ product_name, quantity, price });
      return acc;
    }, {});

    res.json(Object.values(grouped));
  });
});

// ✅ Cancel Order
app.delete('/api/orders/:id', (req, res) => {
  const orderId = req.params.id;

  db.beginTransaction(err => {
    if (err) return res.status(500).json({ error: 'Database error' });

    db.query('DELETE FROM order_items WHERE order_id = ?', [orderId], (err) => {
      if (err) return db.rollback(() => res.status(500).json({ error: 'Failed to delete order items' }));

      db.query('DELETE FROM orders WHERE id = ?', [orderId], (err) => {
        if (err) return db.rollback(() => res.status(500).json({ error: 'Failed to delete order' }));

        db.commit(err => {
          if (err) return db.rollback(() => res.status(500).json({ error: 'Failed to complete deletion' }));
          res.json({ message: 'Order cancelled successfully' });
        });
      });
    });
  });
});

//added1 login
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  console.log("📥 Login ke liye request aayi hai:", email, password); // login request

  db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
    if (err) {
      console.log("❌ Database se data lene me error:", err);
      return res.status(500).send("Database error");
    }

    if (results.length === 0) {
      console.log("❌ Koi user nahi mila is email se:", email);
      return res.status(401).send("User not found");
    }

    console.log("✅ User mil gaya database me:", results[0]);

    // const valid = await bcrypt.compare(password, results[0].password);
    const valid = await(password, results[0].password);
    console.log("🔐 Password sahi hai?:", valid);

    if (!valid) {
      console.log("❌ Password galat hai is user ke liye:", email);
      return res.status(401).send("Wrong password");
    }

    const token = jwt.sign(
      { id: results[0].id, email: results[0].email },
      secretKey,
      { expiresIn: '1d' }
    );

    console.log("✅ Login successful. Token bheja jaa raha hai.");
    res.send({ token });
  });
});


//added2 register
// ✅ Register API
app.post("/register", async (req, res) => {
  const { name, email, password } = req.body;

  console.log("👉 Received data:", req.body); // ✅ Log incoming data

  if (!name || !email || !password) {
    console.log("❌ Missing fields");
    return res.status(400).json({ error: "All fields are required" });
  }

  const checkQuery = "SELECT * FROM users WHERE email = ?";
  db.query(checkQuery, [email], async (err, results) => {
    if (err) {
      console.log("❌ Error checking existing email:", err);
      return res.status(500).json({ error: "Database error" });
    }

    if (results.length > 0) {
      console.log("⚠️ Email already registered:", email);
      return res.status(400).json({ error: "Email already exists" });
    }

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      console.log("✅ Password hashed");

      const insertQuery = "INSERT INTO users (name, email, password) VALUES (?, ?, ?)";
      db.query(insertQuery, [name, email, hashedPassword], (err, result) => {
        if (err) {
          console.log("❌ Error inserting user:", err);
          return res.status(500).json({ error: "Registration failed" });
        }

        console.log("✅ User registered successfully:", result);
        return res.status(201).json({ message: "Registration successful" });
      });
    } catch (hashErr) {
      console.log("❌ Password hashing error:", hashErr);
      return res.status(500).json({ error: "Error hashing password" });
    }
  });
});

// ✅ Start Server
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});






