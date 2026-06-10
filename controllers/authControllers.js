const User = require("../models/User");
const bcrypt = require("bcryptjs");
const registerUser = async (req, res) => {
    try {
        const { name, email, password } = req.body;
const hashedpass= await bcrypt.hash(password, 10);

        const user = await User.create({
            name,
            email,
            password: hashedpass,
        });

        res.status(201).json({
            success: true,
            user,
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

module.exports = { registerUser };
