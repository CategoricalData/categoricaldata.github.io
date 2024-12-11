<html><head>


<link rel="stylesheet" href="http://categoricaldata.net/css/nstyle.css"><script src="http://categoricaldata.net/js/simple.js"></script>
<div>
  <form action="search.php" method="get">
       <input type="text" name="text" value=<?php echo "\"" . $_GET["text"] . "\"" ; ?> > 
              <input type="submit" name="submit" value="Search">
              
              <br>
    </form>

</div>


<?php

$string = $_GET["text"];


if (strpos(file_get_contents('../logo.html'), $string) !== false) {
        echo "<a href=\"../logo.html\">CQL Manual</a><br/>";
}
    
$dir = new DirectoryIterator('.');
foreach ($dir as $file) {
    if ($file == 'search.php') {
        continue;   
    }
    if ($file == 'logo.html') {
        continue;   
    }
    if ($file == 'options.html') {
        continue;   
    }
    if ($file == 'examples.html') {
        continue;   
    }
    if ($file == 'syntax.html') {
        continue;   
    }
    $content = file_get_contents($file->getPathname());
    
    if (strpos($content, $string) !== false) {
        echo "<a href=\"" . $file . "\">" . $file . "</a><br/>";
    }
}

?>



</body></html>