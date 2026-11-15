# Clasificador visual local

MobileNet V1 de Keras Applications, ancho 0,25 y entrada RGB de 128 × 128, entrenado sobre ImageNet. La conversión conserva las 28 capas, incorpora la normalización a sus pesos y aplica cuantización de 8 bits por filtro. El peso del modelo es 493 488 bytes. Se ejecuta en el navegador, en un worker cuando se activa la letra.

- [Implementación original de Keras](https://github.com/keras-team/keras/blob/master/keras/src/applications/mobilenet.py)
- [Pesos originales](https://storage.googleapis.com/tensorflow/keras-applications/mobilenet/mobilenet_2_5_128_tf.h5)
- [Índice de clases](https://storage.googleapis.com/download.tensorflow.org/data/imagenet_class_index.json)
- [Licencia de Keras](LICENSE.txt)

El tema para fotos se limita a grupos visuales reconocibles con suficiente confianza. Para visualizaciones satelitales del catálogo toma el tema de NASA SVS y compone los versos con el color y la luz medidos en la imagen.
