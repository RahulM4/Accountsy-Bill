import { useState, useCallback, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import styles from './Uploader.module.css'
import { Grid, LinearProgress } from '@material-ui/core';
import { withStyles } from '@material-ui/core/styles';



const BorderLinearProgress = withStyles((theme) => ({
  root: {
    height: 5,
    borderRadius: 5,
  },
  colorPrimary: {
    backgroundColor: theme.palette.grey[theme.palette.type === 'light' ? 200 : 700],
  },
  bar: {
    borderRadius: 5,
    backgroundColor: '#008d3f;',
  },
}))(LinearProgress);

export default function Uploader({ form, setForm }) {
  const [file, setFile] = useState();
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    setForm({ ...form, logo: file })
    // eslint-disable-next-line
  }, [file])

  const onDrop = useCallback((acceptedFiles) => {
    const url = process.env.REACT_APP_CLOUDINARY_URL;

    acceptedFiles.forEach(async (acceptedFile) => {

      const formData = new FormData();
      formData.append("file", acceptedFile);
      formData.append("upload_preset", "accountsyLogo");
      formData.append("cloud_name", "dzm13rwwt")

      const response = await fetch(url, {
        method: "POST",
        body: formData,
      });
      setProgress(100)
      const data = await response.json();
      console.log(data)
      setFile(data.secure_url)

    });
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accepts: "image/*,application/pdf",
    multiple: false,
  });


  return (
    <>
      <div
        {...getRootProps()}
        className={`${styles.dropzone} ${isDragActive ? styles.active : null}`}
      >
        <input {...getInputProps()} />
        Upload Logo
      </div>
      <Grid item style={{ width: '100%' }}>
        <BorderLinearProgress variant="determinate" value={progress} />
      </Grid>
    </>
  );
}

