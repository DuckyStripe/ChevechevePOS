import React from "react";
import ImageWithBasePath from "../img/imagewithbasebath";

const Logo = () => {
  const logoStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '20px'
  };

  const imageStyle = {
    width: '50px',
    height: 'auto'
  };

  const textStyle = {
    fontSize: '28px', // Tamaño más grande para una mejor presencia
    fontFamily: "'Poppins', sans-serif", // Usa Poppins de Google Fonts
    fontWeight: '700', // Grosor de 700 para una apariencia más robusta
    margin: 0
  };

  return (
    <>
      <div className="login-logo logo-normal" style={logoStyle}>
        <ImageWithBasePath src="assets/img/logo.png" alt="img" style={imageStyle} />
        <h2 style={textStyle}>CHEVE-POS</h2>
      </div>
      <div className="login-logo logo-white" style={logoStyle}>
        <ImageWithBasePath src="assets/img/logo-white.png" alt="" style={imageStyle} />
        <h2 style={textStyle}>CHEVE-POS</h2>
      </div>
    </>
  );
};

export default Logo;
