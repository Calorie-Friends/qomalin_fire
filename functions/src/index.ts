import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
// export const helloWorld = functions.https.onRequest((request, response) => {
//   functions.logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
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
