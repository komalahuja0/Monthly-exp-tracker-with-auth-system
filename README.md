JWT Authentication System:

A secure authentication system built using Node.js, Express.js, MongoDB, Mongoose, bcryptjs, and JSON Web Tokens (JWT).

Features:
User Registration
User Login
Password Hashing using bcrypt
JWT Token Generation
Protected Routes using Middleware
User Profile Endpoint
MongoDB Atlas Integration
Tech Stack
Node.js
Express.js
MongoDB Atlas
Mongoose
bcryptjs
JSON Web Token (JWT)
Thunder Client (API Testing)
API Endpoints
Register User
POST /api/auth/register

Request Body:

{
  "name": "Komal",
  "email": "komal@gmail.com",
  "password": "123456"
}
Login User
POST /api/auth/login

Request Body:

{
  "email": "komal@gmail.com",
  "password": "123456"
}

Response:

{
  "success": true,
  "token": "JWT_TOKEN"
}
Get User Profile
GET /api/auth/profile

Headers:

Authorization: Bearer JWT_TOKEN

Response:

{
  "success": true,
  "user": {
    "_id": "...",
    "name": "Komal",
    "email": "komal@gmail.com"
  }
}
Authentication Flow:
User registers with name, email, and password.
Password is hashed using bcrypt before being stored in MongoDB.
User logs in using email and password.
Password is verified using bcrypt.compare().
A JWT token is generated upon successful login.
The token is sent with protected requests.
Middleware verifies the token and grants access to authorized users.
Installation

Clone the repository:

git clone <repository-url>

Install dependencies:

npm install

Create a .env file:

PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key

Start the server:

npm run dev
Learning Outcomes

This project helped me understand:

REST APIs
Authentication & Authorization
Password Security
JWT-based Authentication
Express Middleware
MongoDB & Mongoose
Backend Project Structure
Future Improvements
Update Profile
Change Password
Password Reset
Refresh Tokens
Role-Based Access Control
Input Validation


Author:
Komal Ahuja
B.Tech Student | Aspiring Full-Stack Developer