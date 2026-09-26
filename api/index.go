package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// User represents a joined device
type User struct {
	Username     string `bson:"username" json:"username"`
	Subscription string `bson:"subscription" json:"subscription"`
	LastSeen     int64  `bson:"last_seen" json:"last_seen"`
}

type JoinRequest struct {
	Username     string          `json:"username"`
	Subscription json.RawMessage `json:"subscription"`
}

type BeepRequest struct {
	TargetUsername string `json:"target_username"`
	FromUsername   string `json:"from_username"`
	CustomSoundUrl string `json:"custom_sound_url,omitempty"`
}

var (
	mongoClient *mongo.Client
	clientOnce  sync.Once
	clientErr   error
)

func getMongoClient() (*mongo.Client, error) {
	clientOnce.Do(func() {
		uri := os.Getenv("MONGODB_URI")
		if uri == "" {
			clientErr = fmt.Errorf("MONGODB_URI environment variable is not set")
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
		if err != nil {
			clientErr = err
			return
		}
		mongoClient = client
	})
	return mongoClient, clientErr
}

// setCORS sets permissive headers for demo testing
func setCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
}

// Handler is the Vercel Serverless Function entrypoint
func Handler(w http.ResponseWriter, r *http.Request) {
	setCORS(w)
	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusNoContent)
		return
	}

	path := r.URL.Path
	// Normalize path (handle /api/join or /join depending on rewrite)
	path = strings.TrimPrefix(path, "/api")
	path = strings.TrimSuffix(path, "/")

	switch path {
	case "/join":
		handleJoin(w, r)
	case "/users":
		handleUsers(w, r)
	case "/beep":
		handleBeep(w, r)
	case "", "/health":
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok","message":"Demo PWA Go Backend is running"}`))
	default:
		http.NotFound(w, r)
	}
}

func handleJoin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req JoinRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("invalid body: %v", err), http.StatusBadRequest)
		return
	}

	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" {
		http.Error(w, "username is required", http.StatusBadRequest)
		return
	}

	client, err := getMongoClient()
	if err != nil {
		http.Error(w, fmt.Sprintf("db connection error: %v", err), http.StatusInternalServerError)
		return
	}

	coll := client.Database("demo_pwa").Collection("users")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	user := User{
		Username:     req.Username,
		Subscription: string(req.Subscription),
		LastSeen:     time.Now().Unix(),
	}

	// Upsert user by username
	filter := bson.M{"username": req.Username}
	update := bson.M{"$set": user}
	opts := options.Update().SetUpsert(true)

	_, err = coll.UpdateOne(ctx, filter, update, opts)
	if err != nil {
		http.Error(w, fmt.Sprintf("failed to save user: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":   "joined",
		"username": req.Username,
	})
}

func handleUsers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	client, err := getMongoClient()
	if err != nil {
		http.Error(w, fmt.Sprintf("db connection error: %v", err), http.StatusInternalServerError)
		return
	}

	coll := client.Database("demo_pwa").Collection("users")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Only show users active within the last 2 hours
	cutoff := time.Now().Unix() - 7200
	cursor, err := coll.Find(ctx, bson.M{"last_seen": bson.M{"$gt": cutoff}})
	if err != nil {
		http.Error(w, fmt.Sprintf("query error: %v", err), http.StatusInternalServerError)
		return
	}
	defer cursor.Close(ctx)

	var users []map[string]interface{}
	for cursor.Next(ctx) {
		var u User
		if err := cursor.Decode(&u); err == nil {
			users = append(users, map[string]interface{}{
				"username":  u.Username,
				"last_seen": u.LastSeen,
				"has_push":  len(u.Subscription) > 10,
			})
		}
	}

	if users == nil {
		users = []map[string]interface{}{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}

func handleBeep(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req BeepRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("invalid body: %v", err), http.StatusBadRequest)
		return
	}

	client, err := getMongoClient()
	if err != nil {
		http.Error(w, fmt.Sprintf("db connection error: %v", err), http.StatusInternalServerError)
		return
	}

	coll := client.Database("demo_pwa").Collection("users")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	var targetUser User
	err = coll.FindOne(ctx, bson.M{"username": req.TargetUsername}).Decode(&targetUser)
	if err != nil {
		http.Error(w, fmt.Sprintf("user '%s' not found", req.TargetUsername), http.StatusNotFound)
		return
	}

	if targetUser.Subscription == "" || targetUser.Subscription == "null" {
		http.Error(w, "target user does not have an active push subscription", http.StatusBadRequest)
		return
	}

	s := &webpush.Subscription{}
	if err := json.Unmarshal([]byte(targetUser.Subscription), s); err != nil {
		http.Error(w, fmt.Sprintf("invalid subscription payload: %v", err), http.StatusInternalServerError)
		return
	}

	// Payload sent to client Service Worker
	payloadMap := map[string]interface{}{
		"title":            "🚨 ALERT BEEP!",
		"body":             fmt.Sprintf("🔊 '%s' กดส่งเสียงปี๊ปหาคุณ!", req.FromUsername),
		"from":             req.FromUsername,
		"custom_sound_url": req.CustomSoundUrl,
		"timestamp":        time.Now().UnixMilli(),
	}
	payloadBytes, _ := json.Marshal(payloadMap)

	vapidPublic := os.Getenv("VAPID_PUBLIC_KEY")
	vapidPrivate := os.Getenv("VAPID_PRIVATE_KEY")
	subscriberEmail := os.Getenv("VAPID_SUBSCRIBER")
	if subscriberEmail == "" {
		subscriberEmail = "mailto:admin@example.com"
	}

	resp, err := webpush.SendNotification(payloadBytes, s, &webpush.Options{
		Subscriber:      subscriberEmail,
		VAPIDPublicKey:  vapidPublic,
		VAPIDPrivateKey: vapidPrivate,
		TTL:             30,
		Urgency:         webpush.UrgencyHigh, // Highest urgency for fast delivery
	})

	if err != nil {
		http.Error(w, fmt.Sprintf("failed to send push: %v", err), http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "sent",
		"target": req.TargetUsername,
		"from":   req.FromUsername,
	})
}
