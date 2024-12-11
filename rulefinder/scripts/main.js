var main = function() { 
    // Processing configurations from the form
    var insc = document.getElementById("inschema").value;
    var nullcheck = document.getElementById('nullcheck').checked ? 0 : 1;
    var e = document.getElementById('candCard');
    var candCard = e.options[e.selectedIndex].value;
    var tables = process_schema(insc);
    // if the text processor didn't find any create table matches, then reports this error 
    if (!tables) { 
        document.getElementById('outscript').value = error_msg;
        return;
    }

    var outscript = pkProcedure + fkProcedure;
    
    // Writing calls to pk checker
    tables.forEach(val => { 
        var name = val[0]; 
        var cols = val[1]; 
        var back = pkBackSel(name, cols); 
        var middle = pkMiddleSel(name, cols);
        cols.forEach(val => { 
            var front = pkFrontSel(name, cols, [val]);
            var query = `CALL pkCheck("${name}", "${val}", ${front}, ${middle}, ${back}, 1, ${nullcheck}, 1, @outcome);`;
            outscript += query + '\r';
        })
        // we first call pkcheck for each individual column to build up the primary key temporary table 
        if (candCard == 2)  { 
            cols.forEach(first => { 
                cols.forEach(second => {
                    if (first > second) { 
                        var front = pkFrontSel(name, cols, [first, second]);
                        var query = `CALL pkCheck("${name}", "${first},${second}", ${front}, ${middle}, ${back}, 1, ${nullcheck}, 2, @outcome);`;
                        outscript += query + '\r';
                    }
                })
            })   
        }
    });

    
    // Writing calls to fk checker
    tables.forEach(val1 => { 
        var name1 = val1[0]; 
        var cols1 = val1[1]; 
        var nc1 = [];
        cols1.forEach(cl1 => { 
            nc1.push(name1.concat('.', cl1));
        })
        tables.forEach(val2 => { 
            var name2 = val2[0]; 
            var cols2 = val2[1];
            if (name1 != name2) { 
                cols1.forEach(col1 => { 
                    cols2.forEach(col2 => { 
                        var query = `CALL fkCheck('${name1}', '${name2}', '${col1}', '${col2}', ${pkFrontSel(name2, cols2, [col2])}, ${pkMiddleSel(name2, cols2)}, ${pkBackSel(name2, cols2)}, '${nc1}', ${nullcheck}, 1);`;
                        // outStream.write(query + '\r');
                        outscript += query + '\r';
                    })
                })
            }
        })
    })

 //   download('outscript.sql', outscript);
    document.getElementById('outscript').value = outscript;
}

// takes user input sql, isolates the create table queries, and outputs 
// a list of ASTs for each of these such queries.
var process_schema = function(input) { 
    var parser;
    var ast;
    var create_pattern = /create table [^;]*;/gmis;
    var create_statements = input.match(create_pattern); 
    if (!create_statements) { 
        return null;
    }
    var tables = []; 
    create_statements.forEach((val, index) => { 
        parser = new NodeSQLParser.Parser();
        ast = parser.astify(String(val)); 
        if (ast) { 
            var nc = extractNameCol(ast);
            tables.push(nc); 
    }})
    return tables;
}

// accepts an ast object, of a create table statement, from our sql parser and returns a tuple of the form, 
// [name, cols], where cols is a list of the column names of the table 
var extractNameCol = function(astree) { 
    var name = astree[0].table[0].table; 
    var cols = [];
    astree[0].create_definitions.forEach((val, index) => { 
        if (val.column) {
    cols.push(val.column.column); }})
    return [name, cols];
}

// Returns the front half of the select statement to check if COL is a valid PK for TABLE 
var pkFrontSel = function(table, columns, pk) { 
    var query = `'SELECT DISTINCT `;
    columns.forEach((val, index) => { 
        if (index == 0) { 
            query += `a.${val} as a${val}, b.${val} as b${val}`
        } else { 
            query += `, a.${val} as a${val}, b.${val} as b${val}`
        }
    })
    query += ` FROM ${table} AS a, ${table} AS b WHERE a.${pk[0]} = b.${pk[0]}`
    if (pk.length == 2) { 
        query += ` AND a.${pk[1]} = b.${pk[1]}`
    }
    return query + `'`;
}    

var pkMiddleSel = function(table, columns) { 
    var colstring = `'(`; 
    columns.forEach((val, index) => { 
        if (index == 0) { 
            colstring += ` a.${val}, b.${val}`
        } else{
            colstring += `, a.${val}, b.${val}`
        }
    })
    colstring += `)'`;
    return colstring;
}

// Returns the back half of the select statement to check if COL is a valid PK for TABLE 
var pkBackSel = function(table, columns) { 
    var query = `'SELECT DISTINCT `
    columns.forEach((val, index) => { 
        if (index == 0) { 
            query += `a.${val} as a${val}, b.${val} as b${val}`
        } else { 
            query += `, a.${val} as a${val}, b.${val} as b${val}`
        }
    })
    query +=  ` FROM ${table} AS a, ${table} AS b WHERE `; 
    columns.forEach((val, index) => { 
        if (index == 0) { 
            query += `a.${val} = b.${val}`;
        } else { 
            query += ` AND a.${val} = b.${val}`;
        } 
    })

    return query + `'`;
}

const error_msg = 
`An error was encountered processing your schema definitions.
Refer to remarks below for supported sql data types, and to example usage for a simple reference.
Also please note that this program is in beta, so please reach out with any suspected bugs to a contact on the home page.`;

const pkProcedure = 
`DROP TABLE IF EXISTS pks; 
CREATE TABLE pks (table_name TEXT, col_name TEXT);

delimiter // 
DROP PROCEDURE IF EXISTS pkCheck //
CREATE PROCEDURE pkCheck 
(IN tablename TEXT, IN colname TEXT, IN front TEXT, IN middle TEXT, IN back TEXT, IN report INT, IN checkNulls INT, IN cardinal INT, OUT outcome INT) 
BEGIN
  SET @size1 := 1;
  SET @size2 := 1;
  SET @t1 = CONCAT('SELECT count(*) INTO @size1 FROM (', front, ' AND ', middle, ' NOT IN (', back, ')) as subq;' );
  PREPARE sel1 FROM @t1;
  EXECUTE sel1;
  DEALLOCATE PREPARE sel1;
  
  SET @t2 = CONCAT('SELECT count(*) INTO @size2 FROM (', back, ' AND ', middle, ' NOT IN (', front, ')) as subq;' );
  PREPARE sel2 FROM @t2;
  EXECUTE sel2;
  DEALLOCATE PREPARE sel2;

  SET @size3 := 0;
  SET @size4 := 0;
  IF checkNulls = 1 THEN
    SET @size3 := 1;
    IF cardinal = 1 THEN 
        SET @t3 = CONCAT('SELECT COUNT(1) - COUNT(', colname, ') INTO @size3 FROM ', tablename, ';');
        PREPARE sel3 FROM @t3;
        EXECUTE sel3;
        DEALLOCATE PREPARE sel3;
    ELSE 
        SET @first := 'a'; 
        SET @second := 'b';
        SELECT substring_index(colname, ',', 1) INTO @first; 
        SELECT substring_index(colname, ',', -1) INTO @second;
    
        SET @t3 = CONCAT('SELECT COUNT(1) - COUNT(', first, ') INTO @size3 FROM ', tablename, ';');
        PREPARE sel3 FROM @t3;
        EXECUTE sel3;
        DEALLOCATE PREPARE sel3;

        SET @t3 = CONCAT('SELECT COUNT(1) - COUNT(', second, ') INTO @size4 FROM ', tablename, ';');
        PREPARE sel3 FROM @t3;
        EXECUTE sel3;
        DEALLOCATE PREPARE sel3;
    END IF;
  END IF;
  
  SELECT 0 INTO @outcome;
  IF @size1 = 0 AND @size2 = 0 AND @size3 = 0 AND @size4 = 0 THEN  
        IF report = 1 THEN 
            IF cardinal = 1 THEN 
                SELECT CONCAT(colname, " is a PK of ", tablename) as '';
                INSERT INTO pks VALUES (tablename, colname);
            ELSE 
                SET @first := 'a'; 
                SET @second := 'b';
                SET @pkfirst := 1; 
                SET @pksecond := 1; 
                SELECT substring_index(colname, ',', 1) INTO @first; 
                SELECT substring_index(colname, ',', -1) INTO @second;
                select EXISTS(SELECT * FROM pks WHERE table_name = tablename AND col_name = @first) INTO @pkfirst;
                select EXISTS(SELECT * FROM pks WHERE table_name = tablename AND col_name = @second) INTO @pksecond;
                IF @pkfirst = 0 AND @pksecond = 0 THEN
                    SELECT CONCAT('(', @first, ', ', @second, ") is a PK of ", tablename) as '';
                END IF;
            END IF;
        END IF;
        SELECT 1 INTO @outcome;
  END IF;
  SET outcome = @outcome;
END
//
delimiter ;
`;

const fkProcedure = 
`

delimiter // 
DROP PROCEDURE IF EXISTS fkCheck // 
CREATE PROCEDURE fkCheck 
(IN name1 TEXT, IN name2 TEXT, IN col1 TEXT, IN col2 TEXT, IN front TEXT, IN middle TEXT, IN back TEXT, IN cols1 TEXT, IN checkNulls INT, IN cardinal INT) 
BEGIN 
    CALL pkCheck(name2, col2, front, middle, back, 0, checkNulls, cardinal, @outcome); 
    IF @outcome = 1 THEN 
        SET @size3 := 1;
        SET @t3 = CONCAT('SELECT COUNT(*) INTO @size3 FROM (SELECT DISTINCT ', cols1, ' FROM ', name1, ' WHERE (', cols1, ') NOT IN 
            (SELECT DISTINCT ', cols1, ' FROM ', name1, ', ', name2, ' WHERE ', name1, '.', col1, ' = ', name2, '.', col2, ')) as subq;');
        PREPARE sel3 FROM @t3; 
        EXECUTE sel3; 
        DEALLOCATE PREPARE sel3;
        
        IF @size3 = 0 THEN 
            SELECT CONCAT(name1, '.', col1, ' references ', name2, '.', col2) as '';
        END IF;
    END IF;
END
// 
delimiter ;

`;

// autopopulates the schema definition input box with those from the demo
function autopop() { 
    var insc = document.getElementById('inschema'); 
    var defaultSchema = 
    "CREATE TABLE departments (\n dept_no CHAR(4) NOT NULL,\n dept_name VARCHAR(40) NOT NULL );\n\nCREATE TABLE dept_manager (\n emp_no INT NOT NULL,\n dept_no CHAR(4) NOT NULL,\n from_date DATE NOT NULL,\n to_date DATE NOT NULL );";
    insc.value = defaultSchema;
}

function download(filename, text) {
    var element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
    element.setAttribute('download', filename);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  }
  