// create-admin.js
const bcrypt = require("bcryptjs");
const mysql = require("mysql2/promise");

async function createAdmin() {
  const connection = await mysql.createConnection({
    host: "localhost",
    port: 3306,
    user: "root",
    password: "",
    database: "fiscalis",
  });

  // Hash the password
  const password = "Admin@1234";
  const hashedPassword = await bcrypt.hash(password, 12);

  // Check if admin exists
  const [existing] = await connection.query(
    "SELECT id FROM officers WHERE email = ?",
    ["admin@fiscalis.gov.bi"]
  );

  if (existing.length > 0) {
    // Update existing admin
    await connection.query(
      "UPDATE officers SET password_hash = ?, is_active = 1 WHERE email = ?",
      [hashedPassword, "admin@fiscalis.gov.bi"]
    );
    console.log("✅ Admin password updated!");
  } else {
    // Create new admin
    await connection.query(
      `INSERT INTO officers (full_name, email, password_hash, role, department, is_active) 
       VALUES (?, ?, ?, ?, ?, 1)`,
      [
        "Administrateur Système",
        "admin@fiscalis.gov.bi",
        hashedPassword,
        "superadmin",
        "Informatique",
      ]
    );
    console.log("✅ Admin user created!");
  }

  console.log("Email: admin@fiscalis.gov.bi");
  console.log("Password: Admin@1234");

  await connection.end();
}

createAdmin().catch(console.error);
