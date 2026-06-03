// Vocabulary dataset. Add more entries here to grow the deck.
// Each word has a matching cartoon illustration under src/assets/vocab/.

import fire from "../assets/vocab/fire.jpg";
import help from "../assets/vocab/help.jpg";
import beCareful from "../assets/vocab/be-careful.jpg";
import run from "../assets/vocab/run.jpg";
import hello from "../assets/vocab/hello.jpg";
import goodbye from "../assets/vocab/goodbye.jpg";
import thankYou from "../assets/vocab/thank-you.jpg";
import sorry from "../assets/vocab/sorry.jpg";
import eat from "../assets/vocab/eat.jpg";
import drink from "../assets/vocab/drink.jpg";
import sleep from "../assets/vocab/sleep.jpg";
import work from "../assets/vocab/work.jpg";
import water from "../assets/vocab/water.jpg";
import bread from "../assets/vocab/bread.jpg";
import coffee from "../assets/vocab/coffee.jpg";
import apple from "../assets/vocab/apple.jpg";
import airport from "../assets/vocab/airport.jpg";
import hotel from "../assets/vocab/hotel.jpg";
import ticket from "../assets/vocab/ticket.jpg";
import taxi from "../assets/vocab/taxi.jpg";

export type Category =
  | "emergency"
  | "greetings"
  | "daily"
  | "food"
  | "travel";

export interface VocabWord {
  id: string;
  word: string;
  ipa: string;
  category: Category;
  image: string;
}

export const CATEGORIES: { id: Category; label: string; emoji: string }[] = [
  { id: "emergency", label: "Emergency", emoji: "🚨" },
  { id: "greetings", label: "Greetings", emoji: "👋" },
  { id: "daily", label: "Daily Life", emoji: "🏠" },
  { id: "food", label: "Food & Drink", emoji: "🍎" },
  { id: "travel", label: "Travel", emoji: "✈️" },
];

export const VOCABULARY: VocabWord[] = [
  { id: "fire", word: "Fire!", ipa: "ˈfaɪə", category: "emergency", image: fire },
  { id: "help", word: "Help!", ipa: "hɛlp", category: "emergency", image: help },
  { id: "be-careful", word: "Be careful!", ipa: "bi ˈkɛəfl", category: "emergency", image: beCareful },
  { id: "run", word: "Run!", ipa: "rʌn", category: "emergency", image: run },

  { id: "hello", word: "Hello", ipa: "həˈloʊ", category: "greetings", image: hello },
  { id: "goodbye", word: "Goodbye", ipa: "ɡʊdˈbaɪ", category: "greetings", image: goodbye },
  { id: "thank-you", word: "Thank you", ipa: "θæŋk juː", category: "greetings", image: thankYou },
  { id: "sorry", word: "Sorry", ipa: "ˈsɒri", category: "greetings", image: sorry },

  { id: "eat", word: "Eat", ipa: "iːt", category: "daily", image: eat },
  { id: "drink", word: "Drink", ipa: "drɪŋk", category: "daily", image: drink },
  { id: "sleep", word: "Sleep", ipa: "sliːp", category: "daily", image: sleep },
  { id: "work", word: "Work", ipa: "wɜːk", category: "daily", image: work },

  { id: "water", word: "Water", ipa: "ˈwɔːtə", category: "food", image: water },
  { id: "bread", word: "Bread", ipa: "brɛd", category: "food", image: bread },
  { id: "coffee", word: "Coffee", ipa: "ˈkɒfi", category: "food", image: coffee },
  { id: "apple", word: "Apple", ipa: "ˈæpl", category: "food", image: apple },

  { id: "airport", word: "Airport", ipa: "ˈɛəpɔːt", category: "travel", image: airport },
  { id: "hotel", word: "Hotel", ipa: "hoʊˈtɛl", category: "travel", image: hotel },
  { id: "ticket", word: "Ticket", ipa: "ˈtɪkɪt", category: "travel", image: ticket },
  { id: "taxi", word: "Taxi", ipa: "ˈtæksi", category: "travel", image: taxi },
];

export const getByCategory = (c: Category) =>
  VOCABULARY.filter((w) => w.category === c);
