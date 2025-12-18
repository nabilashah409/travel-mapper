import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import RouteBuilder from './components/RouteBuilder';
import { Toaster } from 'sonner';
import './App.css';

function App() {
  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RouteBuilder />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" theme="dark" richColors />
    </>
  );
}

export default App;