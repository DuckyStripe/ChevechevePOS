import React from 'react';

interface ImageProps {
  className?: string;
  src: string;
  alt?: string;
  height?: number;
  width?: number;
  id?: string;
  curved?: boolean; // Añadimos la prop curved
}

const ImageWithGenericUrlCheve = (props: ImageProps) => {
  const altText = props.alt || '';

  // Añadimos los estilos condicionalmente dependiendo de la prop curved
  const styles = {
    borderRadius: props.curved ? '15%' : '0', // Cambiar 50% según tus necesidades
  };

  return (
    <img
      className={props.className || ''}
      src={`https://cheveposapi.codelabs.com.mx/img/Products/${props.src}`} // Corrección aquí
      height={props.height}
      alt={altText}
      width={props.width}
      id={props.id}
      style={styles} // Aplicamos estilos directamente
    />
  );
};

export default ImageWithGenericUrlCheve;
