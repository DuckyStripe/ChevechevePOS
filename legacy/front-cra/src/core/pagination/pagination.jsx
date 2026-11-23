/* eslint-disable no-unused-vars */
import React  from 'react';

export function itemRender(current, type, originalElement) {
    if (type === "prev") {
      return <a>Anterior</a>;
    }
    if (type === "next") {
      return <a>Siguinte</a>;
    }
    return originalElement;
  }

  export function onShowSizeChange(current, pageSize) {
    // console.log(current, pageSize);
  }