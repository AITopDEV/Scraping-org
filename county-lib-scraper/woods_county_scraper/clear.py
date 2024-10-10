import csv

input_file = 'output.csv'
output_file = 'output_.csv'

with open(input_file, 'r', encoding='utf-8') as input_csv, open(output_file, 'w', newline='', encoding='utf-8') as output_csv:
    reader = csv.reader(input_csv)

    # Create a csv writer object for output_csv
    writer = csv.writer(output_csv, quoting=csv.QUOTE_ALL)

    # Create an empty set to keep track of unique 6th cells
    unique_sixth_cells = set()

    # Iterate over each row in csv
    for row in reader:
        # Check if row is not empty or 'null' and if 6th cell is unique
        if "null" not in row and row[5] not in unique_sixth_cells:
            writer.writerow(row)
            unique_sixth_cells.add(row[5])
