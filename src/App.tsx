import React from "react";
import "./App.css";

import Editor from "./components/Editor";

export default function App() {
  return (
    <div className="App">
      <header></header>
      <main className="Main-wrapper">
        <Editor />
      </main>
    </div>
  );
}
