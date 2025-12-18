import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import RouteBuilderNew from './components/RouteBuilderNew';
import { Toaster } from 'sonner';
import './App.css';

function App() {
  return (
    <>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<RouteBuilderNew />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </>
  );
}

export default App;