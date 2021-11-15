import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as maps from "@googlemaps/google-maps-services-js";

// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
// export const helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
const GOOGLE_MAP_API_TOKEN: string = functions.config().google_map.token;
admin.initializeApp();
const firestore = admin.firestore();

export const onCreateUser = functions.auth.user().onCreate((user) => {
  const uid = user.uid;
  firestore.runTransaction(async () => {
    const username = await firestore.collection("usernames").add({
      user_id: uid,
    });
    const user = await firestore.collection("users").add({
      username: username.id,
      avatar_icon: null,
    });
    return user;
  });

});
export const onDeleteUser = functions.auth.user().onDelete((user) => {
  const batch = firestore.batch();
  firestore.runTransaction(async ()=> {
    const questions = await firestore.collection("questions")
      .where("user_id", "==", user.uid).get();
    questions.docs.map((q) => batch.delete(q.ref));
    const answers = await firestore.collectionGroup("answers")
      .where("user_id", "==", user.uid).get();
    answers.docs.map((a) => batch.delete(a.ref));
    batch.delete(firestore.collection("users").doc(user.uid));
    batch.commit();
  });
});


export const onQuestoinCreated = functions.firestore.document("questions/{questionId}").onCreate(async (snapshot) => {  
  const geopoint = snapshot.data()["location"]["geopoint"];
  
  const client = new maps.Client();
  const res = await client.reverseGeocode({
    params: {
      latlng: {
        lat: geopoint["latitude"],
        lng: geopoint["longitude"],
      },
      language: maps.Language.ja,
      key: GOOGLE_MAP_API_TOKEN
    }
  });
  if(res.data.results.length == 0)  {
    console.error(`住所の取得に失敗${res}`);
    return;
  }
  const address = res.data.results[0].formatted_address;
  await snapshot.ref.update({
    address: address
  });
});

