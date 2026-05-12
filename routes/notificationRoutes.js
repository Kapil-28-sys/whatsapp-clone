const express = require("express");

const router = express.Router();

const Notification = require("../models/Notification");

const protect = require("../middleware/authMiddleware");


// GET ALL
router.get("/", protect, async (req, res) => {

  try {

    const notifications =
      await Notification.find({
        userId: req.user.id,
      }).sort({
        createdAt: -1,
      });

    res.json({
      success: true,
      data: notifications,
    });

  } catch (err) {

    res.status(500).json({
      error: err.message,
    });

  }

});


// READ SINGLE
router.patch("/:id/read", protect, async (req, res) => {

  try {

    const notif =
      await Notification.findById(
        req.params.id
      );

    if (!notif) {

      return res.status(404).json({
        error: "Notification not found",
      });

    }

    notif.read = true;

    await notif.save();

    res.json({
      success: true,
    });

  } catch (err) {

    res.status(500).json({
      error: err.message,
    });

  }

});


// READ ALL
router.patch("/read-all/all", protect, async (req, res) => {

  try {

    await Notification.updateMany(
      {
        userId: req.user.id,
        read: false,
      },
      {
        $set: {
          read: true,
        },
      }
    );

    res.json({
      success: true,
    });

  } catch (err) {

    res.status(500).json({
      error: err.message,
    });

  }

});

module.exports = router;