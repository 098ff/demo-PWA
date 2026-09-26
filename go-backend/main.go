package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
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
			clientErr = fmt.Errorf("MONGODB_URI is required")
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

func setCORS(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
}

func handleJoin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req JoinRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	if req.Username == "" {
		http.Error(w, "username is required", http.StatusBadRequest)
		return
	}
	client, err := getMongoClient()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
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
	_, err = coll.UpdateOne(ctx, bson.M{"username": req.Username}, bson.M{"$set": user}, options.Update().SetUpsert(true))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"status": "joined", "username": req.Username})
}

func handleUsers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	client, err := getMongoClient()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	coll := client.Database("demo_pwa").Collection("users")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	cutoff := time.Now().Unix() - 7200
	cursor, err := coll.Find(ctx, bson.M{"last_seen": bson.M{"$gt": cutoff}})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
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
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	client, err := getMongoClient()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
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
		http.Error(w, "user has no push subscription", http.StatusBadRequest)
		return
	}
	s := &webpush.Subscription{}
	if err := json.Unmarshal([]byte(targetUser.Subscription), s); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	payloadBytes, _ := json.Marshal(map[string]interface{}{
		"title":            "🚨 ALERT BEEP!",
		"body":             fmt.Sprintf("🔊 '%s' กดส่งเสียงปี๊ปหาคุณ!", req.FromUsername),
		"from":             req.FromUsername,
		"custom_sound_url": req.CustomSoundUrl,
		"timestamp":        time.Now().UnixMilli(),
	})
	resp, err := webpush.SendNotification(payloadBytes, s, &webpush.Options{
		Subscriber:      os.Getenv("VAPID_SUBSCRIBER"),
		VAPIDPublicKey:  os.Getenv("VAPID_PUBLIC_KEY"),
		VAPIDPrivateKey: os.Getenv("VAPID_PRIVATE_KEY"),
		TTL:             30,
		Urgency:         webpush.UrgencyHigh,
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"status": "sent", "target": req.TargetUsername})
}

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	http.HandleFunc("/api/join", func(w http.ResponseWriter, r *http.Request) {
		setCORS(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		handleJoin(w, r)
	})
	http.HandleFunc("/api/users", func(w http.ResponseWriter, r *http.Request) {
		setCORS(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		handleUsers(w, r)
	})
	http.HandleFunc("/api/beep", func(w http.ResponseWriter, r *http.Request) {
		setCORS(w)
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		handleBeep(w, r)
	})

	log.Printf("Go Server listening on port %s...", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
