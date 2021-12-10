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

interface UserData {
  username: string;
  avatarIcon: string | undefined;
}

/**
 * Userを表すオブジェクト
 */
class User {
  id: string;
  username: string;
  avatarIcon: string | undefined;

  /**
   * 
   * @param {string} id 
   * @param {UserData} data Documentと対応するUserData
   */
  constructor(id: string, data: UserData) {
    this.username = data.username;
    this.id = id;
    this.avatarIcon = data.avatarIcon;
  }
}

/**
 * 回答を表すオブジェクト
 */
interface Answer {
  userId: string,
  text: string,
  questionId: string,
  createdAt: Date,
  updatedAt: Date,
}

interface Question {
  title: string,
  text: string | undefined,
  address: string | undefined,
  imageUrls: Array<string>,
  location: any,
  userId: string
}

const userConverter: FirebaseFirestore.FirestoreDataConverter<User> = {
  fromFirestore(snapshot: FirebaseFirestore.QueryDocumentSnapshot) {
    const data = snapshot.data();
    const udata = data as UserData;
    return new User(snapshot.id, udata);
  },
  toFirestore: (model: User) => {
    return {
      username: model.username,
      avatarIcon: model.avatarIcon
    };
  }
};




export const onCreateUser = functions.auth.user().onCreate((authUser) => {
  const uid = authUser.uid;
  firestore.runTransaction(async () => {
    const username = await firestore.collection("usernames").add({
      userId: uid,
    });
    const user = await firestore.collection("users").withConverter(userConverter).doc(authUser.uid).set(
      new User(
        "", 
        {
          username: username.id,
          avatarIcon: authUser.photoURL,
        }
      )
    );
    console.log(`user:${user}`);
    return user;
  });

});
export const onDeleteUser = functions.auth.user().onDelete(async (user) => {
  const batch = firestore.batch();
  return await firestore.runTransaction(async ()=> {
    console.log(`削除対象:${user.uid}`);
    const questions = await firestore.collection("questions")
      .where("userId", "==", user.uid).get();
    questions.docs.map((q) => batch.delete(q.ref));
    const answers = await firestore.collectionGroup("answers")
      .where("userId", "==", user.uid).get();
    answers.docs.map((a) => batch.delete(a.ref));
    batch.delete(firestore.collection("users").doc(user.uid));
    return await batch.commit();
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

export const onAnswerCreated = functions.firestore.document("/questions/{questionId}/answers/{answer}").onCreate(async (snapshot) => {
  const answer = snapshot.data() as Answer;
  const questionId = answer.questionId;
  const question = (await firestore.collection("questions").doc(questionId).get()).data() as Question;
  if(question.userId == answer.userId) {
    return;
  }
  const userRef = firestore.collection("users").doc(question.userId);
  return await userRef.collection("notifications")
    .add({
      type: "answered",
      recipientId: question.userId,
      userId: answer.userId,
      user: userRef,
      answer: snapshot.ref,
      answerId: snapshot.id,
      createdAt: FirebaseFirestore.FieldValue.serverTimestamp(),
      updatedAt: FirebaseFirestore.FieldValue.serverTimestamp(),
    });
});